import type { Log } from "./api";
export const emptyFilter = {
  query: "",
  company: "",
  department: "",
  status: "",
};
export type HistoryFilter = typeof emptyFilter;
export function filterHistory(rows: Log[], filter: HistoryFilter) {
  const query = filter.query.trim().toLowerCase();
  return rows.filter(
    (row) =>
      (!query || row.name?.toLowerCase().includes(query)) &&
      (!filter.company || row.company === filter.company) &&
      (!filter.department || row.department === filter.department) &&
      (!filter.status || row.status === filter.status),
  );
}
