export default function InfoButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
            className="mt-2 w-6 h-6 rounded-full border rule text-xs muted shrink-0 hover:opacity-80">i</button>
  );
}
