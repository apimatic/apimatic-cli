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
import { useEffect, useMemo, useRef } from 'react';
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
  const openedAt = useRef('');
  const wasOpen = useRef(false);

  // The page the search is made on: a pick changes the address before the dialog reports its close.
  useEffect(() => {
    if (!props.open) return;
    wasOpen.current = true;
    openedAt.current = window.location.href;
  }, [props.open]);

  // A close is seen from the prop, which the hotkey changes too. Fumadocs hands over the pick before the close
  // renders, and the last keystrokes' results may still be loading, so the report waits for the results shown.
  useEffect(() => {
    if (props.open || !wasOpen.current || query.isLoading) return;
    wasOpen.current = false;
    const search_term = search.trim();
    if ((typed.current || picked.current !== '') && search_term !== '') {
      const result_count = results?.length ?? 0;
      analytics.report('docs_search', { search_term, result: picked.current, result_count }, openedAt.current);
    }
    typed.current = false;
    picked.current = '';
  }, [props.open, query.isLoading, search, results]);

  const onSearchChange = (value: string) => {
    typed.current = true;
    setSearch(value);
  };
  const onSelect = (item: SearchItemType) => {
    picked.current = 'url' in item ? item.url : '';
  };

  return (
    <SearchDialog
      search={search}
      onSearchChange={onSearchChange}
      isLoading={query.isLoading}
      {...props}
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
