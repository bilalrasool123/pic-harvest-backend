export type CrawlScope = 'single' | 'multi' | 'full';
export type JobStatus = 'pending' | 'running' | 'done' | 'error';

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  timeout?: number;
}

export interface CrawlProgress {
  pagesVisited: number;
  imagesFound: number;
  currentPage: string;
}

export interface ImageItem {
  id: string;
  url: string;
  sourcePageUrl: string;
  format: string;
  width?: number;
  height?: number;
  fileSize?: number;
  alt?: string;
}

export interface CrawlJob {
  id: string;
  url: string;
  scope: CrawlScope;
  options: Required<CrawlOptions>;
  status: JobStatus;
  progress: CrawlProgress;
  images: ImageItem[];
  error?: string;
  createdAt: number;
  updatedAt: number;
}

export interface StartCrawlRequest {
  url: string;
  scope: CrawlScope;
  options?: CrawlOptions;
}

export interface StartCrawlResponse {
  jobId: string;
}

export interface ZipDownloadRequest {
  images: Array<{ url: string; filename?: string }>;
}
