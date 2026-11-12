'use client';
import {
  SearchDialog,
  SearchDialogClose,
  SearchDialogContent,
  SearchDialogHeader,
  SearchDialogIcon,
  SearchDialogInput,
  SearchDialogList,
  SearchDialogOverlay,
  type SearchItemType,
  type SharedProps
} from 'fumadocs-ui/components/dialog/search';
import { useDocsSearch } from 'fumadocs-core/search/client';
import { staticClient } from 'fumadocs-core/search/client/orama-static';
import { useI18n } from 'fumadocs-ui/contexts/i18n';
import { useMemo, useRef } from 'react';
import { withBasePath } from '@/lib/base-path';
import { analytics } from '@/lib/portal-analytics';

export default function DefaultSearchDialog(props: SharedProps) {
  const { locale } = useI18n();
  const { search, setSearch, query } = useDocsSearch({
    // Served with an extension so hosts and CDNs give it a JSON content type; without one
    // it went out as application/octet-stream, which some of them attach or refuse.
    client: staticClient({
      from: withBasePath('/api/search.json'),
      locale
    })
  });
  // Served URLs, since the dialog navigates by href (search-navigation.test.ts), memoised so its highlight stays put.
  const results = useMemo(
    () => (query.data === 'empty' ? null : query.data?.map((item) => ({ ...item, url: withBasePath(item.url) }))),
    [query.data]
  );

  const typed = useRef(false);
  const picked = useRef('');

  const onSearchChange = (value: string) => {
    typed.current = true;
    setSearch(value);
  };
  const onSelect = (item: SearchItemType) => {
    picked.current = 'url' in item ? item.url : '';
  };
  const onOpenChange = (open: boolean) => {
    props.onOpenChange(open);
    if (open || !typed.current) return;
    typed.current = false;
    const count = results?.length ?? 0;
    // Fumadocs closes the dialog before it hands over the pick, so the report waits a tick for it.
    window.setTimeout(() => {
      analytics.reportSearch(search, picked.current, count);
      picked.current = '';
    }, 0);
  };

  return (
    <SearchDialog
      search={search}
      onSearchChange={onSearchChange}
      isLoading={query.isLoading}
      {...props}
      onOpenChange={onOpenChange}
      onSelect={onSelect}
    >
      <SearchDialogOverlay />
      <SearchDialogContent>
        <SearchDialogHeader>
          <SearchDialogIcon />
          <SearchDialogInput />
          <SearchDialogClose />
        </SearchDialogHeader>
        <SearchDialogList items={results} />
      </SearchDialogContent>
    </SearchDialog>
  );
}
