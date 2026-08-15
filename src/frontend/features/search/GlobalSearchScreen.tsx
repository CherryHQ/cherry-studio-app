import { SearchScopePager } from './components/SearchScopePager';
import { GlobalSearchChrome } from './GlobalSearchChrome/GlobalSearchChrome';

export function GlobalSearchScreen() {
  return (
    <GlobalSearchChrome>
      <SearchScopePager />
    </GlobalSearchChrome>
  );
}
