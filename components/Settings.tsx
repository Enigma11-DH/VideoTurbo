import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Key, Save } from "lucide-react";
import { toast } from "sonner";
import { useTaskStore } from "@/lib/store";
import { t } from "@/lib/i18n";

export function Settings() {
  const language = useTaskStore((state) => state.language);

  const handleSave = () => {
    toast.success(t("settings.saved", language));
  };

  return (
    <div className="max-w-3xl mx-auto p-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {t("settings.title", language)}
        </h1>
        <p className="text-muted-foreground mt-2">
          {t("settings.desc", language)}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Key className="w-5 h-5 mr-2" /> {t("settings.apiKeys", language)}
          </CardTitle>
          <CardDescription>
            {t("settings.apiKeysDesc", language)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="pexels">{t("settings.pexels", language)}</Label>
            <Input
              id="pexels"
              type="password"
              placeholder={t("settings.pexelsPlaceholder", language)}
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.pexelsDesc", language)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="elevenlabs">
              {t("settings.elevenlabs", language)}
            </Label>
            <Input
              id="elevenlabs"
              type="password"
              placeholder={t("settings.elevenlabsPlaceholder", language)}
            />
            <p className="text-xs text-muted-foreground">
              {t("settings.elevenlabsDesc", language)}
            </p>
          </div>

          <Button onClick={handleSave}>
            <Save className="w-4 h-4 mr-2" /> {t("settings.save", language)}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
