import { Routes } from "@angular/router";

export const routes: Routes = [
  { path: "", pathMatch: "full", redirectTo: "library" },
  {
    path: "library",
    loadComponent: () =>
      import("./library/library.component").then((m) => m.LibraryComponent),
  },
  {
    path: "playlists",
    loadComponent: () =>
      import("./shared/placeholder/placeholder.component").then(
        (m) => m.PlaceholderComponent,
      ),
    data: { title: "Playlists y crates" },
  },
  {
    path: "folders",
    loadComponent: () =>
      import("./folders/folders.component").then((m) => m.FoldersComponent),
    data: { title: "Carpetas de biblioteca" },
  },
  {
    path: "duplicates",
    loadComponent: () =>
      import("./duplicates/duplicates.component").then((m) => m.DuplicatesComponent),
    data: { title: "Detección de duplicados" },
  },
  {
    path: "analyzer",
    loadComponent: () =>
      import("./shared/placeholder/placeholder.component").then(
        (m) => m.PlaceholderComponent,
      ),
    data: { title: "Analizador de audio" },
  },
  {
    path: "settings",
    loadComponent: () =>
      import("./shared/placeholder/placeholder.component").then(
        (m) => m.PlaceholderComponent,
      ),
    data: { title: "Ajustes" },
  },
];
