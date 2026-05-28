import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home.component').then(m => m.HomeComponent),
  },
  {
    path: 'auth/login',
    loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'auth/register',
    loadComponent: () => import('./features/auth/register/register.component').then(m => m.RegisterComponent),
  },
  {
    path: 'auth/forgot-password',
    loadComponent: () => import('./features/auth/forgot-password/forgot-password.component').then(m => m.ForgotPasswordComponent),
  },
  {
    path: 'auth/reset-password',
    loadComponent: () => import('./features/auth/reset-password/reset-password.component').then(m => m.ResetPasswordComponent),
  },
  {
    path: 'chat',
    loadComponent: () => import('./features/chat/chat.component').then(m => m.ChatComponent),
  },
  {
    path: 'recommendations',
    loadComponent: () => import('./features/recommendations/recommendations.component').then(m => m.RecommendationsComponent),
  },
  {
    path: 'pantry',
    loadComponent: () => import('./features/pantry/pantry.component').then(m => m.PantryComponent),
    canActivate: [authGuard],
  },
  {
    path: 'meals',
    loadComponent: () => import('./features/meals/meals.component').then(m => m.MealsComponent),
  },
  {
    path: 'meal-planner',
    loadComponent: () => import('./features/meal-planner/meal-planner.component').then(m => m.MealPlannerComponent),
  },
  {
    path: 'notifications',
    loadComponent: () => import('./features/notifications/notifications.component').then(m => m.NotificationsComponent),
  },
  {
    path: 'insights',
    loadComponent: () => import('./features/insights/insights.component').then(m => m.InsightsComponent),
  },
  {
    path: 'profile',
    loadComponent: () => import('./features/profile/profile.component').then(m => m.ProfileComponent),
    canActivate: [authGuard],
  },
  { path: 'home', redirectTo: '' },
  { path: '**', redirectTo: '' },
];
