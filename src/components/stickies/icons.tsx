// Small inline icons from the mock (16px grid, currentColor).

export const JiraIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 1l3.5 3.5L8 8 4.5 4.5 8 1zm0 4L11.5 8.5 8 12 4.5 8.5 8 5zm0 4l3.5 3.5L8 16l-3.5-3.5L8 9z" />
  </svg>
);

export const XIcon = ({ size }: { size?: number }) => (
  <svg viewBox="0 0 16 16" width={size} height={size} fill="currentColor" aria-hidden="true">
    <path d="M12 3.3L11.3 2.6 8 5.9 4.7 2.6 4 3.3 7.3 6.6 4 9.9l.7.7L8 7.3l3.3 3.3.7-.7-3.3-3.3z" />
  </svg>
);

export const PlusIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8.5 7.5V3h-1v4.5H3v1h4.5V13h1V8.5H13v-1H8.5z" />
  </svg>
);

export const TrashIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M6 6h1v6H6zm3 0h1v6H9z" />
    <path d="M2 3v1h1v10a1 1 0 001 1h8a1 1 0 001-1V4h1V3H2zm2 11V4h8v10H4zM6 1h4v1H6z" />
  </svg>
);

export const BlockedIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 1a6 6 0 014.7 9.7L4.3 3.3A6 6 0 018 2zM3.3 4.3l8.4 8.4A6 6 0 013.3 4.3z" />
  </svg>
);

export const SearchIcon = () => (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M15 14.3l-4.2-4.2A5.5 5.5 0 106.5 12a5.5 5.5 0 003.6-1.3l4.2 4.2.7-.6zM2 6.5a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0z" />
  </svg>
);
