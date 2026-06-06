export type LinkedWorkItem = {
  type: "task" | "service_request" | "maintenance";
  id: number;
  title: string;
};
