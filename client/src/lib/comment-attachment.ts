/** Собрать вложение «ссылка» из полей формы (название необязательно). */
export function buildUrlAttachment(
  name: string,
  url: string
): { name: string; url: string } | null {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) return null;

  const normalizedUrl =
    trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")
      ? trimmedUrl
      : `https://${trimmedUrl}`;

  const trimmedName = name.trim();
  let displayName = trimmedName;
  if (!displayName) {
    try {
      displayName = new URL(normalizedUrl).hostname.replace(/^www\./, "");
    } catch {
      displayName = trimmedUrl.length > 48 ? `${trimmedUrl.slice(0, 45)}…` : trimmedUrl;
    }
  }

  return { name: displayName, url: normalizedUrl };
}

export function deriveLinkTitleFromUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return "Ссылка";
  const normalized =
    trimmed.startsWith("http://") || trimmed.startsWith("https://")
      ? trimmed
      : `https://${trimmed}`;
  try {
    return new URL(normalized).hostname.replace(/^www\./, "");
  } catch {
    return trimmed.length > 48 ? `${trimmed.slice(0, 45)}…` : trimmed;
  }
}
