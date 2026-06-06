/** Контрастные классы бейджей для светлой и тёмной темы */
export const badgeGreen =
  "bg-green-100 text-green-900 border border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800";
export const badgeBlue =
  "bg-blue-100 text-blue-900 border border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800";
export const badgeYellow =
  "bg-yellow-100 text-yellow-900 border border-yellow-200 dark:bg-yellow-950 dark:text-yellow-200 dark:border-yellow-800";
export const badgeRed =
  "bg-red-100 text-red-900 border border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800";
export const badgeOrange =
  "bg-orange-100 text-orange-900 border border-orange-200 dark:bg-orange-950 dark:text-orange-200 dark:border-orange-800";
export const badgePurple =
  "bg-purple-100 text-purple-900 border border-purple-200 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-800";
export const badgeCyan =
  "bg-cyan-100 text-cyan-900 border border-cyan-200 dark:bg-cyan-950 dark:text-cyan-200 dark:border-cyan-800";
export const badgeGray =
  "bg-gray-100 text-gray-900 border border-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:border-gray-600";

export const serviceRequestStatusColors: Record<string, string> = {
  new: badgeBlue,
  assigned: badgePurple,
  in_progress: badgeYellow,
  waiting_parts: badgeOrange,
  user_review: badgeCyan,
  done: badgeGreen,
  closed: badgeGray,
  returned: badgeRed,
};

export const taskPriorityColors: Record<string, string> = {
  urgent: badgeRed,
  high: badgeOrange,
  medium: badgeYellow,
  low: badgeGreen,
};

export const taskStatusColors: Record<string, string> = {
  completed: badgeGreen,
  in_progress: badgeBlue,
  overdue: badgeRed,
  pending: badgeYellow,
};
