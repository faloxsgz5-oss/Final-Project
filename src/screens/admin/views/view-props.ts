import type {Data} from '../admin-ui';

/**
 * Runs a legacy admin data action, refreshes the page, and reports the outcome
 * so a caller can clear its form only when the write actually succeeded.
 */
export type AdminActionRunner = (
  id: string,
  action: string,
  payload: Record<string, unknown>,
  successMessage: string,
) => Promise<boolean>;

export type AdminViewProps = {
  /** Id of the row whose action is currently in flight, for per-row spinners. */
  actionLoading: string | null;
  data: Data;
  onAction: AdminActionRunner;
  onNavigate: (page: string) => void;
  reload: () => Promise<void>;
};
