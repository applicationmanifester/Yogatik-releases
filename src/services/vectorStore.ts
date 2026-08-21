/**
 * Local Vector Index & Cosine Similarity RAG Engine
 * 100% Client-side, Keyless Semantic Search for Documents and Notes
 */

export interface VectorDocument {
  id: string;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
}

export interface SearchResult {
  doc: VectorDocument;
  score: number;
}

/**
 * Calculates cosine similarity between two vectors
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    const a = vecA[i] ?? 0;
    const b = vecB[i] ?? 0;
    dotProduct += a * b;
    normA += a * a;
    normB += b * b;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * In-memory client-side vector store
 */
export class ClientVectorStore {
  private docs: Map<string, VectorDocument> = new Map();

  addDocument(doc: VectorDocument): void {
    this.docs.set(doc.id, doc);
  }

  addDocuments(docs: VectorDocument[]): void {
    docs.forEach((doc) => this.addDocument(doc));
  }

  removeDocument(id: string): void {
    this.docs.delete(id);
  }

  clear(): void {
    this.docs.clear();
  }

  search(queryEmbedding: number[], topK = 5): SearchResult[] {
    const results: SearchResult[] = [];

    for (const doc of this.docs.values()) {
      if (doc.embedding) {
        const score = cosineSimilarity(queryEmbedding, doc.embedding);
        results.push({ doc, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  count(): number {
    return this.docs.size;
  }
}

export const clientVectorStore = new ClientVectorStore();
