'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useChildren, LoadingBlock } from '../../components/AppShell';
import { EmptyState } from '../../components/ui';

/**
 * /app has no content of its own — it exists to route you onwards to whichever
 * child you were looking at, or to the empty state if there are none yet.
 */
export default function AppIndex() {
  const { list } = useChildren() ?? {};
  const router = useRouter();

  useEffect(() => {
    if (list?.length) router.replace(`/app/${list[0].id}`);
  }, [list, router]);

  if (list === null || list === undefined) return <LoadingBlock />;

  if (!list.length) {
    return (
      <EmptyState
        title="Add your first child"
        body="Sprout needs a name, a date of birth and a sex to start plotting growth against the WHO standards. Use “Add child” above."
      />
    );
  }

  return <LoadingBlock label="Opening" />;
}
