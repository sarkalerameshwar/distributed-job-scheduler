import { createBrowserRouter } from "react-router-dom";
import { AppLayout } from "../layouts/AppLayout";
import { DashboardPage } from "../pages/DashboardPage";
import { LoginPage, RegisterPage } from "../pages/AuthPages";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { OrganizationsPage } from "../pages/OrganizationsPage";
import { OrganizationDetailPage } from "../pages/OrganizationDetailPage";
import { ProjectsPage } from "../pages/ProjectsPage";
import { ProjectDetailPage } from "../pages/ProjectDetailPage";
import { QueuesPage } from "../pages/QueuesPage";
import { QueueDetailPage } from "../pages/QueueDetailPage";
import { JobsPage } from "../pages/JobsPage";
import { JobDetailPage } from "../pages/JobDetailPage";
import { SchedulesPage } from "../pages/SchedulesPage";
import { DlqPage } from "../pages/DlqPage";
import { WorkersPage } from "../pages/WorkersPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppLayout />,
    children: [
      { path: "login", element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: "organizations", element: <OrganizationsPage /> },
          { path: "organizations/:id", element: <OrganizationDetailPage /> },
          { path: "projects", element: <ProjectsPage /> },
          { path: "projects/:id", element: <ProjectDetailPage /> },
          { path: "queues", element: <QueuesPage /> },
          { path: "queues/:id", element: <QueueDetailPage /> },
          { path: "jobs", element: <JobsPage /> },
          { path: "jobs/:id", element: <JobDetailPage /> },
          { path: "schedules", element: <SchedulesPage /> },
          { path: "dlq", element: <DlqPage /> },
          { path: "workers", element: <WorkersPage /> },
        ],
      },
    ],
  },
]);
