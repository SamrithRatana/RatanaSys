"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";

type Member = {
  name?: string | null;
  email?: string | null;
  image?: string | null;
  title?: string | null;
  balances?: {
    annualAvailable?: number | null;
    sickAvailable?: number | null;
    personalAvailable?: number | null;
  } | null;
};

type Team = {
  id: string;
  name: string;
  department: string;
  moderator?: { name?: string | null; email?: string | null; image?: string | null } | null;
  members: Member[];
};

type Props = {
  teams: Team[];
  currentUserRole: string;
};

export default function TeamsTable({ teams, currentUserRole }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (teams.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        មិនទាន់មានក្រុមណាមួយទេ
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {teams.map((team) => (
        <Card key={team.id} className="overflow-hidden">
          <CardHeader
            className="cursor-pointer select-none"
            onClick={() => setExpanded(expanded === team.id ? null : team.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-lg">{team.name}</CardTitle>
                <Badge variant="outline">{team.department}</Badge>
                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/40">
                  {team.members.length} នាក់
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {currentUserRole === "ADMIN" && (
                  <>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
                {expanded === team.id
                  ? <ChevronUp className="h-5 w-5 text-muted-foreground" />
                  : <ChevronDown className="h-5 w-5 text-muted-foreground" />}
              </div>
            </div>

            {/* Moderator */}
            <div className="flex items-center gap-2 mt-2">
              <Avatar className="h-7 w-7">
                <AvatarImage src={team.moderator?.image ?? ""} />
                <AvatarFallback>{team.moderator?.name?.[0] ?? "M"}</AvatarFallback>
              </Avatar>
              <span className="text-sm text-muted-foreground">
                Moderator: <strong>{team.moderator?.name ?? "—"}</strong>
              </span>
            </div>
          </CardHeader>

          {/* Members expanded */}
          {expanded === team.id && (
            <CardContent className="pt-0">
              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-4 py-2">បុគ្គលិក</th>
                      <th className="text-left px-4 py-2">តួនាទី</th>
                      <th className="text-center px-4 py-2">Annual</th>
                      <th className="text-center px-4 py-2">Sick</th>
                      <th className="text-center px-4 py-2">Personal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {team.members.map((m, i) => (
                      <tr key={i} className="border-t hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <Avatar className="h-7 w-7">
                              <AvatarImage src={m.image ?? ""} />
                              <AvatarFallback>{m.name?.[0] ?? "U"}</AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{m.name ?? "—"}</p>
                              <p className="text-xs text-muted-foreground">{m.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{m.title ?? "—"}</td>
                        <td className="px-4 py-2 text-center">
                          <Badge variant="outline">{m.balances?.annualAvailable ?? 0} ថ្ងៃ</Badge>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <Badge variant="outline">{m.balances?.sickAvailable ?? 0} ថ្ងៃ</Badge>
                        </td>
                        <td className="px-4 py-2 text-center">
                          <Badge variant="outline">{m.balances?.personalAvailable ?? 0} ថ្ងៃ</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}