export interface PageResult<T> {
  items: T[];
  nextPageToken?: string;
}

export function createPageResult<T>(items: T[], nextPageToken?: string): PageResult<T> {
  return nextPageToken ? { items, nextPageToken } : { items };
}
