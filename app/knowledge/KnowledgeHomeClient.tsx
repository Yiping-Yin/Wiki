'use client';

import { KnowledgeHomeStatic } from './KnowledgeHomeStatic';

type KnowledgeHomeGroup = {
  label: string;
  items: Array<{
    slug: string;
    label: string;
  }>;
};

export function KnowledgeHomeClient({
  groups,
}: {
  groups: KnowledgeHomeGroup[];
}) {
  return (
    <KnowledgeHomeStatic groups={groups} />
  );
}
