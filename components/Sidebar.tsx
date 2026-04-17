import {
  Film,
  PlusCircle,
  Settings as SettingsIcon,
  ListVideo,
  Languages,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTaskStore } from "@/lib/store";
import { t } from "@/lib/i18n";
import { useState } from "react";
import { toast } from "sonner";

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const { tasks, language, setLanguage } = useTaskStore();
  const [currentLang, setCurrentLang] = useState(language);

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
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">v2.0.0</div>
          <button
            onClick={() => {
              const newLang = currentLang === 'en' ? 'zh' : 'en';
              setCurrentLang(newLang);
              setLanguage(newLang);
            }}
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
