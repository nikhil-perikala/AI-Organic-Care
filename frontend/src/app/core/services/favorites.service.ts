import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface ApiRecipe {
  id: string;
  title: string;
  description: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number;
  meal_type: string | null;
  cuisine_type: string | null;
  ailment_tags: string[];
  health_benefits: string[];
  dietary_labels: string[];
  efficacy_score: number;
  image_url: string | null;
  recipe_ingredients: { ingredient: { name: string; category: string | null }; quantity: string | null; unit: string | null }[];
}

@Injectable({ providedIn: 'root' })
export class FavoritesService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private readonly api = environment.apiUrl;

  favouriteIds      = signal<Set<string>>(new Set());
  favouriteRecipes  = signal<ApiRecipe[]>([]);

  load() {
    if (!this.auth.isLoggedIn()) return;
    this.http.get<ApiRecipe[]>(`${this.api}/recipes/favourites`)
      .pipe(catchError(() => of([])))
      .subscribe(recipes => {
        this.favouriteRecipes.set(recipes);
        this.favouriteIds.set(new Set(recipes.map(r => r.id)));
      });
  }

  toggle(recipeId: string, recipeData?: ApiRecipe) {
    if (!this.auth.isLoggedIn()) return;

    const ids = new Set(this.favouriteIds());
    if (ids.has(recipeId)) {
      // Optimistic unsave
      ids.delete(recipeId);
      this.favouriteRecipes.update(list => list.filter(r => r.id !== recipeId));
    } else {
      // Optimistic save
      ids.add(recipeId);
      if (recipeData) {
        this.favouriteRecipes.update(list => [recipeData, ...list.filter(r => r.id !== recipeId)]);
      }
    }
    this.favouriteIds.set(ids);

    this.http.post<{ saved: boolean }>(`${this.api}/recipes/${recipeId}/favourite`, {})
      .pipe(catchError(() => of(null)))
      .subscribe(res => {
        // If the server disagrees with our optimistic state, re-sync
        if (res !== null) {
          const currentIds = new Set(this.favouriteIds());
          const serverSays = res.saved;
          const localSays  = currentIds.has(recipeId);
          if (serverSays !== localSays) this.load();
        }
      });
  }
}
