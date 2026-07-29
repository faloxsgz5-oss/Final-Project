import type {DashboardPrioritizationService} from './prioritizationService.ts';

export interface ExpressLikeRequest {
  query?: Record<string, unknown>;
}

export interface ExpressLikeResponse {
  status(code: number): ExpressLikeResponse;
  json(body: unknown): unknown;
}

export type ExpressLikeNext = (error?: unknown) => void;

export interface ExpressLikeRouter {
  get(
    path: string,
    handler: (
      request: ExpressLikeRequest,
      response: ExpressLikeResponse,
      next: ExpressLikeNext,
    ) => Promise<void> | void,
  ): unknown;
}

export function registerPrioritizationRoutes(
  router: ExpressLikeRouter,
  service: DashboardPrioritizationService,
) {
  router.get('/api/dashboard/prioritized', async (request, response, next) => {
    try {
      const userId = stringQuery(request.query?.userId);
      if (!userId) {
        response.status(400).json({error: 'userId query parameter is required'});
        return;
      }

      const displayCap = numberQuery(request.query?.displayCap);
      const now = stringQuery(request.query?.now);
      const result = await service.getPrioritizedDashboard({
        ...(displayCap ? {displayCap} : {}),
        ...(now ? {now} : {}),
        userId,
      });

      response.status(200).json(result);
    } catch (error) {
      next(error);
    }
  });
}

function stringQuery(value: unknown) {
  if (Array.isArray(value)) return stringQuery(value[0]);
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function numberQuery(value: unknown) {
  const raw = stringQuery(value);
  if (!raw) return undefined;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}
