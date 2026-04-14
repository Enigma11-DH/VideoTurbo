import {
  Film,
  PlusCircle,
  Settings as SettingsIcon,
  ListVideo,
  Scissors,
  ImageIcon,
  Languages,
  LogOut,
  LogIn,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import { useEffect, useState } from "react";
import { auth, signInWithGoogle, logout } from "@/lib/firebase";
import { onAuthStateChanged, User } from "firebase/auth";
import { toast } from "sonner";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const { tasks, language, setLanguage } = useTaskStore();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    if (!auth) return;
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithGoogle();
      toast.success(t("studio.complete", language) || "Logged in successfully");
    } catch (error) {
      toast.error(t("studio.failed", language) || "Login failed");
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      toast.success(t("studio.complete", language) || "Logged out successfully");
    } catch (error) {
      toast.error(t("studio.failed", language) || "Logout failed");
    }
  };

  const activeTasksCount = tasks.filter(
    (t) => t.status !== "completed" && t.status !== "failed",
  ).length;

  const navItems = [
    { id: "new", label: t("sidebar.newProject", language), icon: PlusCircle },
    {
      id: "tasks",
      label: t("sidebar.taskList", language),
      icon: ListVideo,
      badge: activeTasksCount,
    },
    { id: "studio", label: t("sidebar.videoStudio", language), icon: Scissors },
    { id: "assets", label: t("sidebar.aiAssets", language), icon: ImageIcon },
    { id: "settings", label: t("sidebar.settings", language), icon: SettingsIcon },
  ];

  return (
    <div className="w-64 border-r bg-muted/30 flex flex-col h-full shrink-0">
      <div className="h-14 flex items-center px-6 border-b">
        <Film className="w-6 h-6 mr-2 text-primary" />
        <span className="font-semibold text-lg tracking-tight">VideoTurbo</span>
      </div>
      <div className="flex-1 py-6 px-4 space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center px-4 py-3 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="w-5 h-5 mr-3" />
              {item.label}
              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={cn(
                    "ml-auto text-xs py-0.5 px-2 rounded-full",
                    isActive
                      ? "bg-primary-foreground text-primary"
                      : "bg-primary text-primary-foreground",
                  )}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      
      <div className="p-4 border-t space-y-4">
        {auth ? (
          user ? (
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium truncate max-w-[120px]">{user.displayName || user.email}</span>
              <button onClick={handleLogout} className="text-xs text-muted-foreground hover:text-foreground flex items-center">
                <LogOut className="w-4 h-4 mr-1" />
                Logout
              </button>
            </div>
          ) : (
            <button onClick={handleLogin} className="w-full flex items-center justify-center px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors">
              <LogIn className="w-4 h-4 mr-2" />
              Login with Google
            </button>
          )
        ) : (
          <div className="text-xs text-destructive text-center">
            Firebase not configured
          </div>
        )}
        
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">v1.0.0-beta</div>
          <button
            onClick={() => setLanguage(language === 'en' ? 'zh' : 'en')}
            className="flex items-center text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Languages className="w-4 h-4 mr-1" />
            {language === 'en' ? '中文' : 'EN'}
          </button>
        </div>
      </div>
    </div>
  );
}
