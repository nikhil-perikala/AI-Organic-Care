import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface ShoppingItem {
  ingredient_name: string;
  quantity: string | null;
  unit: string | null;
  reason: string;
}

export interface MealRecommendation {
  rank: number;
  recipe_id: string;
  title: string;
  description: string | null;
  meal_type: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number;
  efficacy_score: number;
  health_benefits: string[];
  dietary_labels: string[];
  ailment_addressed: string[];
  ingredients: {
    name: string;
    quantity: string;
    unit: string;
    in_pantry: boolean;
    health_benefits: string[];
  }[];
  missing_ingredients: ShoppingItem[];
  image_url: string | null;
  source_url: string | null;
  nutritional_info: Record<string, unknown> | null;
}

export interface RecommendationResponse {
  session_id: string;
  query: string;
  detected_ailments: string[];
  ai_explanation: string;
  evidence_summary: string;
  recommendations: MealRecommendation[];
  shopping_list: ShoppingItem[];
  knowledge_sources: string[];
}

export interface FeedbackCreate {
  session_id?: string;
  recipe_id?: string;
  feedback_type: 'like' | 'dislike' | 'save' | 'skip';
  comment?: string;
}

@Injectable({ providedIn: 'root' })
export class RecommendationService {
  private http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getRecommendations(query: string, usePantry = true): Observable<RecommendationResponse> {
    return this.http.post<RecommendationResponse>(`${this.apiUrl}/recommendations`, {
      query,
      use_pantry: usePantry,
    });
  }

  streamRecommendations(query: string, usePantry = true): EventSource {
    const token = localStorage.getItem('access_token');
    const url = `${this.apiUrl}/recommendations/stream`;
    return new EventSource(url);
  }

  submitFeedback(feedback: FeedbackCreate): Observable<unknown> {
    return this.http.post(`${this.apiUrl}/feedback`, feedback);
  }

  getSavedRecipes(): Observable<unknown[]> {
    return this.http.get<unknown[]>(`${this.apiUrl}/feedback/saved`);
  }
}
