import { Doc, PageHeader } from '@/components/blazon/page';

export function NotFoundPage() {
  return (
    <>
      <PageHeader label="Not found" title="Nothing here" />
      <Doc>
        <p className="py-10">This page does not exist. Pick a page from the index.</p>
      </Doc>
    </>
  );
}
