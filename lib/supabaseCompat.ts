type SupabaseErrorLike = {
  code?: string;
  details?: string;
  hint?: string;
  message?: string;
  status?: number;
} | null | undefined;

const unavailableRelations = new Set<string>();
const warnedRelations = new Set<string>();

export const isMissingRelationError = (error: SupabaseErrorLike) => {
  if (!error) return false;

  const text = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();

  return (
    error.status === 404 ||
    error.code === 'PGRST205' ||
    text.includes('could not find the table') ||
    (text.includes('relation') && text.includes('does not exist'))
  );
};

export const isNoRowsError = (error: SupabaseErrorLike) => {
  if (!error) return false;
  return error.status === 406 || error.code === 'PGRST116';
};

export const isRelationUnavailable = (relation: string) => unavailableRelations.has(relation);

export const rememberMissingRelation = (relation: string, error: SupabaseErrorLike) => {
  if (!isMissingRelationError(error)) return false;

  unavailableRelations.add(relation);

  if (!warnedRelations.has(relation)) {
    warnedRelations.add(relation);
    console.warn(`[Supabase] Relation "${relation}" is unavailable in the current project. Feature disabled.`, error);
  }

  return true;
};
