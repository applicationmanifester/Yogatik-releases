package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"
)

const (
	maxResults   = 8
	timeout      = 10 * time.Second
	userAgent    = "Mozilla/5.0 (compatible; YogatikSearch/1.0)"
)

type SearchResult struct {
	Title    string `json:"title"`
	URL      string `json:"url"`
	Snippet  string `json:"snippet,omitempty"`
	Engine   string `json:"engine"`
	Agree    int    `json:"agree,omitempty"`
	Engines  []string `json:"engines,omitempty"`
}

type SearchResponse struct {
	Query          string         `json:"query"`
	Results        []SearchResult `json:"results"`
	EnginesQueried int            `json:"engines_queried"`
	Count          int            `json:"count"`
	Error          string         `json:"error,omitempty"`
}

type EngineFunc func(ctx context.Context, query string, count int) ([]SearchResult, error)

var engines = map[string]EngineFunc{
	"duckduckgo": searchDuckDuckGo,
	"marginalia": searchMarginalia,
	"wikipedia":  searchWikipedia,
}

func main() {
	port := flag.Int("port", 0, "Port to listen on (0 = random)")
	host := flag.String("host", "127.0.0.1", "Host to bind to")
	flag.Parse()

	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	mux := http.NewServeMux()
	mux.HandleFunc("/search", handleSearch)
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	server := &http.Server{
		Addr:         fmt.Sprintf("%s:%d", *host, *port),
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
	}

	// Start server
	listener, err := net.Listen("tcp", server.Addr)
	if err != nil {
		log.Fatalf("Failed to listen: %v", err)
	}
	actualAddr := listener.Addr().(*net.TCPAddr)
	log.Printf("Search sidecar listening on http://%s", actualAddr)
	fmt.Printf("PORT=%d\n", actualAddr.Port) // For Electron/Tauri to capture

	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			log.Printf("Server error: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("Shutting down...")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	server.Shutdown(shutdownCtx)
}

func handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	query := r.URL.Query().Get("q")
	if strings.TrimSpace(query) == "" {
		json.NewEncoder(w).Encode(SearchResponse{Error: "Empty query"})
		return
	}

	count := maxResults
	if c := r.URL.Query().Get("count"); c != "" {
		fmt.Sscanf(c, "%d", &count)
		count = clamp(count, 1, maxResults)
	}

	recency := r.URL.Query().Get("recency") // any, day, week, month, year
	site := r.URL.Query().Get("site")
	enginesParam := r.URL.Query().Get("engines") // "all" or "web"

	wide := enginesParam == "all" && site == ""

	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	defer cancel()

	var wg sync.WaitGroup
	type engineResult struct {
		name   string
		results []SearchResult
		err    error
	}
	resultsChan := make(chan engineResult, len(engines))

	// Determine which engines to run
	activeEngines := []string{"duckduckgo"}
	if wide {
		activeEngines = append(activeEngines, "marginalia", "wikipedia")
	}

	for _, name := range activeEngines {
		if fn, ok := engines[name]; ok {
			wg.Add(1)
			go func(n string, f EngineFunc) {
				defer wg.Done()
				res, err := f(ctx, query, count)
				resultsChan <- engineResult{name: n, results: res, err: err}
			}(name, fn)
		}
	}

	go func() {
		wg.Wait()
		close(resultsChan)
	}()

	var allLists [][]SearchResult
	enginesQueried := 0
	for er := range resultsChan {
		enginesQueried++
		if er.err != nil {
			log.Printf("Engine %s error: %v", er.name, er.err)
			continue
		}
		if len(er.results) > 0 {
			// Tag each result with its engine
			for i := range er.results {
				er.results[i].Engine = er.name
			}
			allLists = append(allLists, er.results)
		}
	}

	merged := mergeResults(allLists, count)

	resp := SearchResponse{
		Query:          query,
		Results:        merged,
		EnginesQueried: enginesQueried,
		Count:          len(merged),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func mergeResults(lists [][]SearchResult, count int) []SearchResult {
	byURL := make(map[string]*SearchResult)

	for rank, list := range lists {
		for i, r := range list {
			if r.URL == "" {
				continue
			}
			key := normalizeURL(r.URL)
			if existing, ok := byURL[key]; ok {
				existing.Agree++
				existing.Engines = append(existing.Engines, r.Engine)
				if existing.Snippet == "" && r.Snippet != "" {
					existing.Snippet = r.Snippet
				}
			} else {
				byURL[key] = &SearchResult{
					Title:    r.Title,
					URL:      r.URL,
					Snippet:  r.Snippet,
					Engine:   r.Engine,
					Agree:    1,
					Engines:  []string{r.Engine},
				}
			}
		}
	}

	results := make([]SearchResult, 0, len(byURL))
	for _, r := range byURL {
		results = append(results, *r)
	}

	sort.Slice(results, func(i, j int) bool {
		if results[i].Agree != results[j].Agree {
			return results[i].Agree > results[j].Agree
		}
		return results[i].Title < results[j].Title
	})

	if len(results) > count {
		results = results[:count]
	}
	return results
}

func normalizeURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil {
		return strings.ToLower(raw)
	}
	host := strings.ToLower(u.Hostname())
	host = strings.TrimPrefix(host, "www.")
	path := strings.TrimRight(u.Path, "/")
	return host + path
}

func clamp(v, min, max int) int {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

// --- Engine implementations ---

func searchDuckDuckGo(ctx context.Context, query string, count int) ([]SearchResult, error) {
	u := fmt.Sprintf("https://lite.duckduckgo.com/lite/?q=%s", url.QueryEscape(query))

	req, _ := http.NewRequestWithContext(ctx, "GET", u, nil)
	req.Header.Set("User-Agent", userAgent)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	return parseDDGHTML(string(body), count), nil
}

func parseDDGHTML(html string, count int) []SearchResult {
	// Simple string parsing - no external deps
	var results []SearchResult
	lines := strings.Split(html, "\n")

	var titles []string
	var urls []string
	var snippets []string

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "<a class=\"result-link\"") || strings.Contains(line, "result-link") {
			// Extract URL and title
			if hrefStart := strings.Index(line, "href=\""); hrefStart != -1 {
				hrefStart += 6
				hrefEnd := strings.Index(line[hrefStart:], "\"")
				if hrefEnd != -1 {
					href := line[hrefStart : hrefStart+hrefEnd]
					// DDG wraps as /l/?uddg=<encoded>
					if uddgStart := strings.Index(href, "uddg="); uddgStart != -1 {
						uddgStart += 5
						uddgEnd := strings.Index(href[uddgStart:], "&")
						if uddgEnd == -1 {
							uddgEnd = len(href) - uddgStart
						}
						encoded := href[uddgStart : uddgStart+uddgEnd]
						if decoded, err := url.QueryUnescape(encoded); err == nil {
							href = decoded
						}
					}
					urls = append(urls, href)
				}
			}
			if titleStart := strings.Index(line, ">"); titleStart != -1 {
				titleEnd := strings.Index(line[titleStart+1:], "<")
				if titleEnd != -1 {
					title := line[titleStart+1 : titleStart+1+titleEnd]
					titles = append(titles, strings.TrimSpace(title))
				}
			}
		}
		if strings.Contains(line, "result-snippet") || strings.Contains(line, "class=\"snippet\"") {
			if start := strings.Index(line, ">"); start != -1 {
				end := strings.Index(line[start+1:], "<")
				if end != -1 {
					snippet := line[start+1 : start+1+end]
					snippets = append(snippets, strings.TrimSpace(snippet))
				}
			}
		}
	}

	for i := 0; i < min(len(titles), len(urls), count); i++ {
		snip := ""
		if i < len(snippets) {
			snip = snippets[i]
		}
		results = append(results, SearchResult{
			Title:   titles[i],
			URL:     urls[i],
			Snippet: snip,
			Engine:  "duckduckgo",
		})
	}
	return results
}

func searchMarginalia(ctx context.Context, query string, count int) ([]SearchResult, error) {
	u := fmt.Sprintf("https://old-search.marginalia.nu/search?query=%s", url.QueryEscape(query))

	req, _ := http.NewRequestWithContext(ctx, "GET", u, nil)
	req.Header.Set("User-Agent", userAgent)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	return parseMarginaliaHTML(string(body), count), nil
}

func parseMarginaliaHTML(html string, count int) []SearchResult {
	var results []SearchResult
	// Simple parsing for .search-result cards
	parts := strings.Split(html, "class=\"search-result\"")
	for _, part := range parts[1:] {
		if len(results) >= count {
			break
		}
		// Find first <a href="http...
		aStart := strings.Index(part, "<a href=\"http")
		if aStart == -1 {
			continue
		}
		aStart += 9 // skip "<a href=\""
		aEnd := strings.Index(part[aStart:], "\"")
		if aEnd == -1 {
			continue
		}
		link := part[aStart : aStart+aEnd]

		// Title is between > and </a>
		titleStart := strings.Index(part[aStart+aEnd:], ">")
		if titleStart == -1 {
			continue
		}
		titleStart += aStart + aEnd + 1
		titleEnd := strings.Index(part[titleStart:], "<")
		if titleEnd == -1 {
			continue
		}
		title := strings.TrimSpace(part[titleStart : titleStart+titleEnd])

		// Snippet from .description or <p>
		snippet := ""
		for _, cls := range []string{"class=\"description\"", "<p>"} {
			if idx := strings.Index(part, cls); idx != -1 {
				start := idx + len(cls)
				if cls == "<p>" {
					start = idx + 3
				} else {
					// find next >
					if gt := strings.Index(part[start:], ">"); gt != -1 {
						start += gt + 1
					}
				}
				if end := strings.Index(part[start:], "<"); end != -1 {
					snippet = strings.TrimSpace(part[start : start+end])
					break
				}
			}
		}

		if title != "" && link != "" {
			results = append(results, SearchResult{
				Title:   title,
				URL:     link,
				Snippet: snippet,
				Engine:  "marginalia",
			})
		}
	}
	return results
}

func searchWikipedia(ctx context.Context, query string, count int) ([]SearchResult, error) {
	u := fmt.Sprintf("https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=%s&srlimit=%d&format=json&origin=*",
		url.QueryEscape(query), count)

	req, _ := http.NewRequestWithContext(ctx, "GET", u, nil)
	req.Header.Set("User-Agent", userAgent)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var data struct {
		Query struct {
			Search []struct {
				Title   string `json:"title"`
				Snippet string `json:"snippet"`
			} `json:"search"`
		} `json:"query"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	results := make([]SearchResult, 0, len(data.Query.Search))
	for _, r := range data.Query.Search {
		titleEscaped := strings.ReplaceAll(r.Title, " ", "_")
		results = append(results, SearchResult{
			Title:   r.Title,
			URL:     "https://en.wikipedia.org/wiki/" + url.PathEscape(titleEscaped),
			Snippet: stripHTML(r.Snippet),
			Engine:  "wikipedia",
		})
	}
	return results, nil
}

func stripHTML(s string) string {
	// Remove HTML tags
	var b strings.Builder
	inTag := false
	for _, r := range s {
		switch r {
		case '<':
			inTag = true
		case '>':
			inTag = false
		default:
			if !inTag {
				b.WriteRune(r)
			}
		}
	}
	// Collapse whitespace
	return strings.Join(strings.Fields(b.String()), " ")
}

func min(nums ...int) int {
	m := nums[0]
	for _, n := range nums[1:] {
		if n < m {
			m = n
		}
	}
	return m
}