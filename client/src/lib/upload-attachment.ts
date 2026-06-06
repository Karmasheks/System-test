export async function uploadCommentAttachment(
  file: File,
  displayName?: string
): Promise<{ name: string; url: string }> {
  const token = localStorage.getItem("token");
  const form = new FormData();
  form.append("file", file);
  if (displayName?.trim()) {
    form.append("name", displayName.trim());
  }

  const res = await fetch("/api/uploads/attachment", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || "Не удалось загрузить файл");
  }

  return res.json();
}
