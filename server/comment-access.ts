type CommentUser = { id: number; role: string };

export function assertCanModifyComment(authorId: number, user: CommentUser): void {
  if (authorId !== user.id && user.role !== "admin") {
    throw new Error("Недостаточно прав для изменения комментария");
  }
}
