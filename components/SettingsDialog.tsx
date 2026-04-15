import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Key, Save } from "lucide-react";
import { useSettingsStore } from "@/lib/settings-store";
import { toast } from "sonner";

export function SettingsDialog() {
  const { pexelsApiKey, capcutApiKey, elevenlabsApiKey, douyinOpenApiKey, setSettings } = useSettingsStore();
  const [localPexels, setLocalPexels] = React.useState(pexelsApiKey);
  const [localCapcut, setLocalCapcut] = React.useState(capcutApiKey);
  const [localElevenlabs, setLocalElevenlabs] = React.useState(elevenlabsApiKey);
  const [localDouyin, setLocalDouyin] = React.useState(douyinOpenApiKey);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    setLocalPexels(pexelsApiKey);
    setLocalCapcut(capcutApiKey);
    setLocalElevenlabs(elevenlabsApiKey);
    setLocalDouyin(douyinOpenApiKey);
  }, [pexelsApiKey, capcutApiKey, elevenlabsApiKey, douyinOpenApiKey, open]);

  const handleSave = () => {
    setSettings({
      pexelsApiKey: localPexels,
      capcutApiKey: localCapcut,
      elevenlabsApiKey: localElevenlabs,
      douyinOpenApiKey: localDouyin,
    });
    toast.success("Settings saved successfully!");
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="ghost" size="icon" className="rounded-full">
            <Settings className="w-5 h-5" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            API Settings
          </DialogTitle>
          <DialogDescription>
            Configure your API keys here. They are stored locally in your browser.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="pexels" className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              Pexels API Key
            </Label>
            <Input
              id="pexels"
              type="password"
              value={localPexels}
              onChange={(e) => setLocalPexels(e.target.value)}
              placeholder="Enter Pexels API Key"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="capcut" className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              CapCut / JianYing API Key
            </Label>
            <Input
              id="capcut"
              type="password"
              value={localCapcut}
              onChange={(e) => setLocalCapcut(e.target.value)}
              placeholder="Enter CapCut API Key"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="elevenlabs-dialog" className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              ElevenLabs API Key
            </Label>
            <Input
              id="elevenlabs-dialog"
              type="password"
              value={localElevenlabs}
              onChange={(e) => setLocalElevenlabs(e.target.value)}
              placeholder="Enter ElevenLabs API Key"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="douyin-dialog" className="flex items-center gap-2">
              <Key className="w-4 h-4" />
              Douyin Open Platform API Key
            </Label>
            <Input
              id="douyin-dialog"
              type="password"
              value={localDouyin}
              onChange={(e) => setLocalDouyin(e.target.value)}
              placeholder="Enter Douyin API Key"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={handleSave} className="w-full">
            <Save className="w-4 h-4 mr-2" />
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
