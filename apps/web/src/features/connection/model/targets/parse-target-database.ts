export function parseTargetDatabase(target: string | null | undefined): string | undefined {
  if (!target) return undefined;
  let url: URL;
  try {
    url = new URL(target);
  } catch {
    return undefined;
  }
  const name = url.pathname.replace(/^\//, "");
  return name ? decodeURIComponent(name) : undefined;
}
