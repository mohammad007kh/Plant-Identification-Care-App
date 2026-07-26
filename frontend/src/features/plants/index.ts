// Barrel export — the app router (T-077) consumes `PlantList`/`PlantDetail`
// (and the query hooks, for route-level prefetching) from here only; no
// route imports individual plants feature files directly.
export { PlantList } from './components/plant-list';
export { PlantDetail } from './components/plant-detail';
export { PlantCard } from './components/plant-card';
export { PlantListEmptyState } from './components/plant-list-empty-state';
export { PhotoHistory } from './components/photo-history';
export { CareGuideCard } from './components/care-guide-card';
export { usePlantsList, PLANTS_PAGE_SIZE } from './hooks/use-plants-list';
export { usePlantDetail } from './hooks/use-plant-detail';
export { PlantsApiError } from './api/plants-api';
