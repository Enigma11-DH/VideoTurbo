/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { Sidebar } from "@/components/Sidebar";
import { NewProject } from "@/components/NewProject";
import { TaskList } from "@/components/TaskList";
import { Settings } from "@/components/Settings";
import { Studio } from "@/components/Studio";

export default function App() {
  const [activeTab, setActiveTab] = useState("new");

  return (
    <div className="flex h-screen w-full bg-background text-foreground overflow-hidden">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="flex-1 overflow-y-auto">
        {activeTab === "new" && <NewProject setActiveTab={setActiveTab} />}
        {activeTab === "tasks" && <TaskList />}
        {activeTab === "studio" && <Studio />}
        {activeTab === "settings" && <Settings />}
      </main>
      <Toaster />
    </div>
  );
}
