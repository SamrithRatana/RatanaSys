import {
  HiOutlineUserGroup,
  HiOutlineSquares2X2,
  HiMiniComputerDesktop,
  HiOutlineBuildingOffice2,
  HiOutlineBriefcase,
  HiOutlineShieldCheck,
} from "react-icons/hi2";
import { TbListCheck } from "react-icons/tb";
import { MdOutlineBalance, MdOutlineEvent } from "react-icons/md";

export const AdminRoutes = [
  { title: "Portal",       url: "/portal",                         icon: HiMiniComputerDesktop },
  { title: "Dashboard",    url: "/dashboard",                      icon: HiOutlineSquares2X2 },
  { title: "Balances",     url: "/dashboard/balances",             icon: MdOutlineBalance },
  { title: "Leaves",       url: "/dashboard/leaves",               icon: TbListCheck },
  { title: "Users",        url: "/dashboard/users",                icon: HiOutlineUserGroup },
  { title: "Events",       url: "/dashboard/events",               icon: MdOutlineEvent }, // ✅ fixed
  { title: "Departments",  url: "/dashboard/settings/departments", icon: HiOutlineBuildingOffice2 },
  { title: "Job Titles",   url: "/dashboard/settings/jobtitles",   icon: HiOutlineBriefcase },
  { title: "Roles",        url: "/dashboard/settings/roles",       icon: HiOutlineShieldCheck },
];

export const UserRoutes = [
  { title: "Portal",   url: "/portal",         icon: HiMiniComputerDesktop },
  { title: "History",  url: "/portal/history", icon: TbListCheck },
];

export const ModeratorRoutes = [
  { title: "Portal",       url: "/portal",                         icon: HiMiniComputerDesktop },
  { title: "Balances",     url: "/dashboard/balances",             icon: MdOutlineBalance },
  { title: "Leaves",       url: "/dashboard/leaves",               icon: TbListCheck },
  { title: "Events",       url: "/dashboard/events",               icon: MdOutlineEvent }, // ✅ fixed
  { title: "Departments",  url: "/dashboard/settings/departments", icon: HiOutlineBuildingOffice2 },
  { title: "Job Titles",   url: "/dashboard/settings/jobtitles",   icon: HiOutlineBriefcase },
];