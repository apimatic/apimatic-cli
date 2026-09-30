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
  type SharedProps
} from 'fumadocs-ui/components/dialog/search';
import { useDocsSearch } from 'fumadocs-core/search/client';
import { staticClient } from 'fumadocs-core/search/client/orama-static';
import { useI18n } from 'fumadocs-ui/contexts/i18n';
import { useMemo } from 'react';
import { withBasePath } from '@/lib/base-path';

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
  // Served URLs, as the dialog navigates by href (search-navigation.test.ts); memoised, as a new array resets its highlight.
  const results = useMemo(
    () => (query.data === 'empty' ? null : query.data?.map((item) => ({ ...item, url: withBasePath(item.url) }))),
    [query.data]
  );

  return (
    <SearchDialog search={search} onSearchChange={setSearch} isLoading={query.isLoading} {...props}>
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
