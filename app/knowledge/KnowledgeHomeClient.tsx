'use client';

import { KnowledgeHomeStatic } from './KnowledgeHomeStatic';

type KnowledgeHomeGroup = {
  label: string;
  items: Array<{
    slug: string;
    label: string;
    count: number;
  }>;
};

export function KnowledgeHomeClient({
  groups,
  totalCollections,
  totalDocs,
}: {
  groups: KnowledgeHomeGroup[];
  totalCollections: number;
  totalDocs: number;
}) {
  return (
    <KnowledgeHomeStatic groups={groups} totalCollections={totalCollections} totalDocs={totalDocs} />
  );
}
