/**
 * Model Download Consent & Metered Connection Gate
 */

export interface ModelDownloadInfo {
  id: string;
  name: string;
  sizeBytes: number;
  sizeFormatted: string;
  description: string;
}

export const ON_DEVICE_MODELS: Record<string, ModelDownloadInfo> = {
  smolvlm: {
    id: 'smolvlm',
    name: 'SmolVLM Vision Model',
    sizeBytes: 241172480, // ~230 MB
    sizeFormatted: '230 MB',
    description: 'On-device vision model for image understanding without sending pictures to the cloud.',
  },
  webllm_q4: {
    id: 'webllm_q4',
    name: 'Llama-3-8B WebLLM (Q4)',
    sizeBytes: 367001600, // ~350 MB
    sizeFormatted: '350 MB',
    description: 'Completely offline zero-key AI model running inside browser WebGPU.',
  },
  xenova_embeddings: {
    id: 'xenova_embeddings',
    name: 'all-MiniLM-L6-v2 Embeddings',
    sizeBytes: 24117248, // ~23 MB
    sizeFormatted: '23 MB',
    description: 'Local vector embedding model for private semantic search and document RAG.',
  },
};

export class ModelConsentManager {
  private consentedModels: Set<string> = new Set();

  constructor() {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('yogatik_model_consents');
        if (saved) {
          const list = JSON.parse(saved);
          if (Array.isArray(list)) {
            list.forEach((m) => this.consentedModels.add(m));
          }
        }
      } catch {
        // Ignore localStorage errors
      }
    }
  }

  hasConsent(modelId: string): boolean {
    return this.consentedModels.has(modelId);
  }

  grantConsent(modelId: string): void {
    this.consentedModels.add(modelId);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('yogatik_model_consents', JSON.stringify(Array.from(this.consentedModels)));
      } catch {
        // Ignore localStorage errors
      }
    }
  }

  revokeConsent(modelId: string): void {
    this.consentedModels.delete(modelId);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('yogatik_model_consents', JSON.stringify(Array.from(this.consentedModels)));
      } catch {
        // Ignore localStorage errors
      }
    }
  }
}

export const modelConsentManager = new ModelConsentManager();
