/**
 * Shared types for Painted City.
 * Mirrors the schema produced by scripts/build_dataset.py.
 */

export interface Artwork {
  id: string;
  source: string;
  title: string;
  artist: string;
  year: string;
  borough: string;
  type: ArtworkType;
  location: string;
  lon: number;
  lat: number;
  description: string;
  artist_statement?: string;
  materials?: string;
  dimensions?: string;
  sponsor?: string;
  donor?: string;
  inscription?: string;
  status?: string;
  image_url?: string;
  source_link?: string;
  parks_link?: string;
}

export type ArtworkType =
  | 'Sculpture'
  | 'Mural'
  | 'Installation'
  | 'Plaque'
  | 'Fountain'
  | 'Relief'
  | 'Signage'
  | 'Other';

export type Borough =
  | 'All'
  | 'Manhattan'
  | 'Brooklyn'
  | 'Queens'
  | 'Bronx'
  | 'Staten Island';

export type EraBucket = 'All' | 'pre1900' | '1900-1949' | '1950-1999' | '2000+';

export type TypeFilter = 'All' | ArtworkType;
