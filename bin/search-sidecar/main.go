package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type SearchRequest struct {
	Query      string   `json:"query"`
	RootPaths  []string `json:"rootPaths"`
	MaxResults int      `json:"maxResults"`
}

type SearchResult struct {
	Path     string `json:"path"`
	Score    int    `json:"score"`
	Snippet  string `json:"snippet"`
	Modified int64  `json:"modified"`
}

type SearchResponse struct {
	Results []SearchResult `json:"results"`
	Error   string         `json:"error,omitempty"`
}

type IndexEntry struct {
	Path     string
	Content  string
	Modified int64
}

var (
	indexMu     sync.RWMutex
	fileIndex   []IndexEntry
	reindexing  int32 // atomic flag: 0 = idle, 1 = reindexing
	indexFile   = ".search_index.json"
)

func main() {
	port := os.Getenv("SEARCH_SIDECAR_PORT")
	if port == "" {
		port = "8765"
	}

	// Load persisted index on startup
	loadIndex()

	// Initialize index on startup (async, non-blocking)
	go func() {
		time.Sleep(500 * time.Millisecond)
		rebuildIndex()
	}()

	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	http.HandleFunc("/search", handleSearch)
	http.HandleFunc("/reindex", handleReindex)

	addr := ":" + port
	log.Printf("Search sidecar listening on %s", addr)
	if err := http.ListenAndServe(addr, nil); err != nil {
		log.Fatal(err)
	}
}

func handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Add request timeout context (5s)
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var req SearchRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, "Invalid request: "+err.Error())
		return
	}

	if req.Query == "" {
		respondError(w, "Query is required")
		return
	}

	if req.MaxResults <= 0 {
		req.MaxResults = 50
	}

	// Read-only access to index - no copy needed
	indexMu.RLock()
	entries := fileIndex
	indexMu.RUnlock()

	select {
	case <-ctx.Done():
		respondError(w, "Request timeout")
		return
	default:
		results := searchFiles(req.Query, req.RootPaths, entries, req.MaxResults)

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(SearchResponse{Results: results})
	}
}

func handleReindex(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Non-blocking reindex
	go rebuildIndex()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "reindexing started"})
}

func rebuildIndex() {
	// Prevent concurrent rebuilds using atomic compare-and-swap
	if !atomic.CompareAndSwapInt32(&reindexing, 0, 1) {
		log.Println("Reindex already in progress, skipping")
		return
	}
	defer atomic.StoreInt32(&reindexing, 0)

	log.Println("Rebuilding search index...")
	var newIndex []IndexEntry

	// Default to current working directory if no roots specified
	roots := []string{"."}
	if len(os.Args) > 1 {
		roots = os.Args[1:]
	}

	for _, root := range roots {
		filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil // Continue walking on error
			}
			if info.IsDir() {
				// Skip hidden directories and common ignore patterns
				name := info.Name()
				if strings.HasPrefix(name, ".") || name == "node_modules" || name == "dist" || name == "build" || name == ".git" {
					return filepath.SkipDir
				}
				return nil
			}

			// Only index text files
			if shouldIndex(path) {
				content, err := readFileContent(path)
				if err == nil && len(content) > 0 {
					newIndex = append(newIndex, IndexEntry{
						Path:     path,
						Content:  content,
						Modified: info.ModTime().UnixMilli(),
					})
				}
			}
			return nil
		})
	}

	indexMu.Lock()
	fileIndex = newIndex
	indexMu.Unlock()

	log.Printf("Index rebuilt: %d files", len(fileIndex))
	persistIndex() // Save to disk
}

func persistIndex() {
	indexMu.RLock()
	data, err := json.Marshal(fileIndex)
	indexMu.RUnlock()

	if err != nil {
		log.Printf("Failed to marshal index: %v", err)
		return
	}

	if err := os.WriteFile(indexFile, data, 0644); err != nil {
		log.Printf("Failed to write index file: %v", err)
	}
}

func loadIndex() {
	data, err := os.ReadFile(indexFile)
	if err != nil {
		if !os.IsNotExist(err) {
			log.Printf("Failed to read index file: %v", err)
		}
		return
	}

	var loaded []IndexEntry
	if err := json.Unmarshal(data, &loaded); err != nil {
		log.Printf("Failed to unmarshal index: %v", err)
		return
	}

	indexMu.Lock()
	fileIndex = loaded
	indexMu.Unlock()

	log.Printf("Loaded persisted index: %d files", len(fileIndex))
}

func shouldIndex(path string) bool {
	ext := strings.ToLower(filepath.Ext(path))
	// Index common text/code file types
	indexableExts := map[string]bool{
		".go": true, ".js": true, ".ts": true, ".jsx": true, ".tsx": true,
		".py": true, ".rs": true, ".java": true, ".cpp": true, ".c": true, ".h": true,
		".json": true, ".yaml": true, ".yml": true, ".toml": true, ".xml": true,
		".md": true, ".txt": true, ".html": true, ".css": true, ".scss": true,
		".sql": true, ".sh": true, ".bash": true, ".zsh": true, ".fish": true,
		".dockerfile": true, ".makefile": true, ".cmake": true,
		".vue": true, ".svelte": true, ".astro": true,
	}
	return indexableExts[ext]
}

func readFileContent(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()

	// Limit file size to 1MB
	const maxSize = 1024 * 1024
	content, err := io.ReadAll(io.LimitReader(file, maxSize))
	if err != nil {
		return "", err
	}
	return string(content), nil
}

func searchFiles(query string, rootPaths []string, entries []IndexEntry, maxResults int) []SearchResult {
	queryLower := strings.ToLower(query)
	// Pre-allocate with reasonable capacity
	results := make([]SearchResult, 0, 128)

	for _, entry := range entries {
		// Filter by root paths if specified
		if len(rootPaths) > 0 {
			matched := false
			for _, root := range rootPaths {
				if strings.HasPrefix(entry.Path, root) {
					matched = true
					break
				}
			}
			if !matched {
				continue
			}
		}

		contentLower := strings.ToLower(entry.Content)
		score := calculateScore(queryLower, contentLower, entry.Path)
		if score > 0 {
			snippet := extractSnippet(entry.Content, queryLower)
			results = append(results, SearchResult{
				Path:     entry.Path,
				Score:    score,
				Snippet:  snippet,
				Modified: entry.Modified,
			})
		}
	}

	// O(n log n) sort using standard library
	sort.Slice(results, func(i, j int) bool {
		return results[i].Score > results[j].Score
	})

	if len(results) > maxResults {
		results = results[:maxResults]
	}
	return results
}

func calculateScore(query, content, path string) int {
	score := 0
	pathLower := strings.ToLower(path)

	// Exact path match
	if strings.Contains(pathLower, query) {
		score += 100
	}

	// Filename match
	filename := filepath.Base(pathLower)
	if strings.Contains(filename, query) {
		score += 50
	}

	// Content matches
	count := strings.Count(content, query)
	score += count * 2

	// Word boundary matches (higher score)
	words := strings.Fields(query)
	for _, word := range words {
		if len(word) > 2 {
			if strings.Contains(content, " "+word+" ") || strings.Contains(content, word+" ") || strings.Contains(content, " "+word) {
				score += 10
			}
		}
	}

	return score
}

func extractSnippet(content, query string) string {
	idx := strings.Index(strings.ToLower(content), query)
	if idx == -1 {
		if len(content) > 200 {
			return content[:200] + "..."
		}
		return content
	}

	start := idx - 100
	if start < 0 {
		start = 0
	}
	end := idx + len(query) + 100
	if end > len(content) {
		end = len(content)
	}

	snippet := content[start:end]
	if start > 0 {
		snippet = "..." + snippet
	}
	if end < len(content) {
		snippet = snippet + "..."
	}
	return snippet
}

func respondError(w http.ResponseWriter, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusBadRequest)
	json.NewEncoder(w).Encode(SearchResponse{Error: msg})
}