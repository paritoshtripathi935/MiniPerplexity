/**
 * Inline "Save scenario" affordance for the calc card footer.
 *
 * Stripped-down replacement for the old ScenarioBar footer — that component
 * mixed save + load + delete + duplicate + compare into one row. With
 * PR F.2's left-side ScenariosPanel owning everything except save, the
 * footer is now just one button: collapsed → "Save scenario"; expanded →
 * name input + Save.
 */
import { useState } from 'react';
import { Bookmark } from 'lucide-react';

interface Props {
  scenarioCount: number;
  onSave: (name: string) => void;
}

export function SaveScenarioButton({ scenarioCount, onSave }: Props) {
  const [adding, setAdding] = useState(false);
  const [draftName, setDraftName] = useState('');

  const startAdd = () => {
    setDraftName(scenarioCount === 0 ? 'Current' : `Scenario ${scenarioCount + 1}`);
    setAdding(true);
  };

  const commit = () => {
    const name = draftName.trim();
    if (name) onSave(name);
    setAdding(false);
    setDraftName('');
  };

  if (!adding) {
    return (
      <div className="mt-4 pt-3 border-t border-border flex justify-end">
        <button
          type="button"
          onClick={startAdd}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-chip bg-primary-container text-on-primary text-body-sm font-medium hover:bg-primary transition-colors"
        >
          <Bookmark className="w-3.5 h-3.5" />
          Save scenario
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-3 border-t border-border flex items-center justify-end gap-1.5">
      <input
        autoFocus
        value={draftName}
        onChange={e => setDraftName(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') commit();
          if (e.key === 'Escape') {
            setAdding(false);
            setDraftName('');
          }
        }}
        className="h-8 px-2 text-body-sm rounded-chip border border-outline-variant bg-surface outline-none focus-visible:shadow-focus w-44"
        placeholder="Scenario name"
      />
      <button
        type="button"
        onClick={commit}
        className="h-8 px-3 rounded-chip bg-primary-container text-on-primary text-body-sm font-medium hover:bg-primary transition-colors"
      >
        Save
      </button>
    </div>
  );
}
