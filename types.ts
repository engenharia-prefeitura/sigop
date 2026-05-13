export enum DocStatus {
  IN_PROGRESS = 'Em Andamento',
  DRAFT = 'Rascunho',
  AWAITING_SIGNATURE = 'Aguardando Assinatura',
  FINISHED = 'Finalizado',
  REJECTED = 'Rejeitado'
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  role: string;
  created_at: string;
}

export interface Document {
  id: string;
  title: string;
  type: string;
  content: any; // JSONB
  status: string; // Mapear para DocStatus na UI se necessário
  created_by: string;
  created_at: string;
  updated_at: string;
  // Campos join (opcionais na query)
  profiles?: Profile;
}

export type DashboardStats = {
  totalDocuments: number;
  drafts: number;
  finished: number;
  awaitingSignature: number;
};
