import { type ReactNode, useEffect } from 'react';
import { Pencil, X } from 'lucide-react';

interface EditableSectionProps {
  sectionId: string;
  isOwner: boolean;
  isEditing: boolean;
  viewAsVisitor: boolean;
  onEdit: (sectionId: string) => void;
  onClose: () => void;
  children: ReactNode;
  editContent: ReactNode;
}

export default function EditableSection({
  sectionId,
  isOwner,
  isEditing,
  viewAsVisitor,
  onEdit,
  onClose,
  children,
  editContent,
}: EditableSectionProps) {
  const showEditAffordance = isOwner && !viewAsVisitor && !isEditing;

  useEffect(() => {
    if (!isEditing) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, onClose]);

  if (isEditing) {
    return (
      <div className="relative border-2 border-emerald-300 rounded-2xl bg-white shadow-sm mb-4">
        <div className="absolute -top-2.5 left-4 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full tracking-wider">
          Editing
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 rounded-lg bg-stone-100 hover:bg-stone-200 text-stone-500 transition-colors z-10"
          aria-label="Close editor"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="p-6 pt-5">
          {editContent}
        </div>
      </div>
    );
  }

  return (
    <div className="relative group">
      {showEditAffordance && (
        <button
          onClick={() => onEdit(sectionId)}
          className="absolute top-3 right-3 p-2 rounded-lg bg-stone-50 text-stone-400 transition-all z-10
                     opacity-70 md:opacity-0 md:group-hover:opacity-100
                     hover:bg-emerald-50 hover:text-emerald-600"
          aria-label={`Edit ${sectionId}`}
        >
          <Pencil className="w-4 h-4" />
        </button>
      )}
      {children}
    </div>
  );
}
