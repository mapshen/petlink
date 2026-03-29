import { useEffect } from 'react';

export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = `${title} - PetLink`;
    return () => { document.title = 'PetLink'; };
  }, [title]);
}
