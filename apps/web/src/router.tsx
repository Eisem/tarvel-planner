import { Route, Routes } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { WorkbenchPage } from "./features/workbench/WorkbenchPage";
import { VotingPage } from "./features/voting/VotingPage";

export function AppRouter() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/rooms/:roomCode/workbench" element={<WorkbenchPage />} />
      <Route path="/rooms/:roomCode/vote" element={<VotingPage />} />
    </Routes>
  );
}
