import { NextRequest, NextResponse } from "next/server";
import { getMysqlPool } from "@/lib/mysql";
import { getActiveWazuhHost } from "@/lib/cluster-failover";
import { requireTenantScope } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantCode = searchParams.get("tenantCode");
    const os = searchParams.get("os") || "linux-deb"; // linux-deb | linux-rpm | windows

    if (!tenantCode || !tenantCode.trim()) {
      return NextResponse.json(
        { success: false, error: "tenantCode query parameter is required" },
        { status: 400 }
      );
    }

    // BOLA defense: Tenant Admin can only access their own tenant enrollment script
    const auth = await requireTenantScope(request, undefined, tenantCode);
    if (auth.errorResponse) return auth.errorResponse;

    // Fetch tenant details from MySQL
    const pool = getMysqlPool();
    const [rows]: any = await pool.query(
      "SELECT tenant_code, campus_name, database_name FROM tenants WHERE tenant_code = ? LIMIT 1",
      [tenantCode.trim().toUpperCase()]
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { success: false, error: `Tenant with code '${tenantCode}' not found` },
        { status: 404 }
      );
    }

    const tenant = rows[0];

    // Resolve active healthy Wazuh Manager node dynamically via failover cluster
    const wazuhManagerHost = await getActiveWazuhHost();
    if (!wazuhManagerHost) {
      return NextResponse.json(
        { success: false, error: "No healthy Wazuh Manager node reachable in cluster" },
        { status: 503 }
      );
    }

    const wazuhAgentVersion = process.env.WAZUH_AGENT_VERSION || "4.14.6-1";
    const targetGroup = tenant.database_name;
    let command = "";
    let instructions = "";

    if (os === "linux-deb") {
      command = `wget https://packages.wazuh.com/4.x/wazuh-agent_${wazuhAgentVersion}_amd64.deb && sudo WAZUH_MANAGER='${wazuhManagerHost}' WAZUH_AGENT_GROUP='${targetGroup}' dpkg -i ./wazuh-agent_${wazuhAgentVersion}_amd64.deb && sudo systemctl daemon-reload && sudo systemctl enable wazuh-agent && sudo systemctl start wazuh-agent`;
      instructions = "Run command in terminal on Ubuntu/Debian server with sudo / root privileges.";
    } else if (os === "linux-rpm") {
      command = `sudo WAZUH_MANAGER='${wazuhManagerHost}' WAZUH_AGENT_GROUP='${targetGroup}' yum install -y https://packages.wazuh.com/4.x/yum/wazuh-agent-${wazuhAgentVersion}.x86_64.rpm && sudo systemctl daemon-reload && sudo systemctl enable wazuh-agent && sudo systemctl start wazuh-agent`;
      instructions = "Run command in terminal on CentOS/RHEL/AlmaLinux server with sudo / root privileges.";
    } else {
      command = `Invoke-WebRequest -Uri https://packages.wazuh.com/4.x/windows/wazuh-agent-${wazuhAgentVersion}.msi -OutFile \${env:tmp}\\wazuh-agent.msi; msiexec.exe /i \${env:tmp}\\wazuh-agent.msi /q WAZUH_MANAGER='${wazuhManagerHost}' WAZUH_AGENT_GROUP='${targetGroup}'; NET START Wazuh`;
      instructions = "Buka PowerShell sebagai Administrator (Run as Administrator) lalu paste perintah di atas.";
    }

    return NextResponse.json({
      success: true,
      tenantCode: tenant.tenant_code,
      campusName: tenant.campus_name,
      targetGroup,
      os,
      wazuhManager: wazuhManagerHost,
      command,
      instructions,
    });
  } catch (err: any) {
    console.error("API /api/wazuh/enrollment-script GET Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to generate agent enrollment script" },
      { status: 500 }
    );
  }
}
