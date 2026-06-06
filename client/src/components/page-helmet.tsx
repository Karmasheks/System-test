import { Helmet } from "react-helmet";

const DEFAULT_TITLE = "StarLine";

export function PageHelmet({ title }: { title?: string }) {
  const pageTitle = title?.trim() || DEFAULT_TITLE;
  return (
    <Helmet>
      <title>{pageTitle}</title>
    </Helmet>
  );
}
