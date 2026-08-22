import { Component } from "@angular/core";
import { Router, RouterOutlet } from "@angular/router";
import { PlayerBarComponent } from "./player/player-bar.component";

interface NavItem {
  label: string;
  icon: string;
  route: string;
}

@Component({
  selector: "app-root",
  imports: [RouterOutlet, PlayerBarComponent],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.css",
})
export class AppComponent {
  navItems: NavItem[] = [
    { label: "Biblioteca", icon: "pi pi-list", route: "/library" },
    { label: "Playlists", icon: "pi pi-play-circle", route: "/playlists" },
    { label: "Carpetas", icon: "pi pi-folder-open", route: "/folders" },
    { label: "Duplicados", icon: "pi pi-clone", route: "/duplicates" },
    { label: "Analizador", icon: "pi pi-wave-pulse", route: "/analyzer" },
    { label: "Ajustes", icon: "pi pi-cog", route: "/settings" },
  ];

  constructor(private router: Router) {}

  goTo(route: string): void {
    console.log("navigate to", route);
    this.router
      .navigate([route])
      .catch((err) => console.error("Navigation error:", err));
  }

  isActive(route: string): boolean {
    return this.router.url.startsWith(route);
  }
}
