// Interfaces de base pour les nœuds et les données de mind map

/**
 * Structure brute d'un nœud de mind map reçue de l'API OpenAI
 */
export interface RawMindMapNode {
  /** Texte du nœud */
  text: string
  /** Nœuds enfants optionnels */
  children?: RawMindMapNode[]
}

/**
 * Structure brute complète d'un mind map reçue de l'API OpenAI
 */
export interface RawMindMapData {
  /** Nœud racine du mind map */
  root: RawMindMapNode
}

/**
 * Représente un nœud dans le mind map après traitement
 */
export interface MindMapNode {
  /** Identifiant unique du nœud */
  id: string
  /** Texte du nœud */
  text: string
  /** Nœuds enfants optionnels */
  children?: MindMapNode[]
}

/**
 * Représente un mind map complet avec métadonnées
 */
export interface MindMap {
  /** Identifiant unique du mind map */
  id: string
  /** Matière/sujet principal */
  subject: string
  /** Thème spécifique */
  topic: string
  /** Nœud racine du mind map */
  root: MindMapNode
  /** Date de création */
  createdAt: string
}

/**
 * Réponse paginée pour les requêtes de mind maps
 */
export interface PaginatedResponse {
  /** Liste des mind maps */
  mindMaps: MindMap[]
  /** Nombre total de mind maps disponibles */
  total: number
  /** Indique s'il y a plus de résultats */
  hasMore: boolean
}

/**
 * Interface commune pour les services de stockage
 */
export interface IStorageService {
  /** Initialise le bucket de stockage */
  initBucket(): Promise<void>
  /** Stocke un mind map */
  storeMindMap(mindMap: MindMap): Promise<string>
  /** Récupère tous les mind maps avec pagination */
  getAllMindMaps(offset?: number, limit?: number): Promise<PaginatedResponse>
}

/**
 * Options pour les mécanismes de réessai
 */
export interface RetryOptions {
  /** Nombre de tentatives */
  retries: number
  /** Handler appelé à chaque échec */
  onFailedAttempt: (error: {
    attemptNumber: number
    retriesLeft: number
    message: string
  }) => void
  /** Facteur multiplicatif pour les temps d'attente */
  factor: number
  /** Délai minimal entre tentatives (ms) */
  minTimeout: number
  /** Délai maximal entre tentatives (ms) */
  maxTimeout: number
}

/**
 * Types possibles pour le statut de traitement
 */
export type Status = 'Success' | 'Failure'

/**
 * Résultat du traitement d'un mind map
 */
export interface ProcessingResult {
  /** Sujet traité */
  topic: string
  /** Statut du traitement */
  status: Status
  /** Message d'erreur optionnel en cas d'échec */
  error?: string
}

/**
 * Structure d'une ligne du CSV d'entrée
 */
export interface CSVInputRow {
  /** Matière/sujet principal */
  subject: string
  /** Thème spécifique */
  topic: string
}

/**
 * Structure d'une ligne du CSV de sortie
 */
export interface CSVOutputRow {
  /** Thème traité */
  topic: string
  /** Statut du traitement */
  status: string
}
