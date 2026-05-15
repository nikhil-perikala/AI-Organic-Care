import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface UsdaFood {
  fdc_id: number;
  description: string;
  data_type: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
}

export interface PantryItem {
  id: string;
  ingredient_name: string;
  quantity: string | null;
  unit: string | null;
  category: string | null;
  expiry_date: string | null;   // YYYY-MM-DD
  storage_tips: string | null;
  added_at: string;
}

@Injectable({ providedIn: 'root' })
export class PantryService {
  private http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  list(): Observable<PantryItem[]> {
    return this.http.get<PantryItem[]>(`${this.apiUrl}/pantry`);
  }

  add(item: Omit<PantryItem, 'id' | 'added_at'>): Observable<PantryItem> {
    return this.http.post<PantryItem>(`${this.apiUrl}/pantry`, item);
  }

  addBulk(items: Omit<PantryItem, 'id' | 'added_at'>[]): Observable<PantryItem[]> {
    return this.http.post<PantryItem[]>(`${this.apiUrl}/pantry/bulk`, items);
  }

  update(id: string, item: Omit<PantryItem, 'id' | 'added_at'>): Observable<PantryItem> {
    return this.http.patch<PantryItem>(`${this.apiUrl}/pantry/${id}`, item);
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/pantry/${id}`);
  }

  searchFoods(q: string, limit = 8): Observable<UsdaFood[]> {
    return this.http.get<UsdaFood[]>(`${this.apiUrl}/foods/search`, {
      params: { q, limit: limit.toString() },
    });
  }
}
