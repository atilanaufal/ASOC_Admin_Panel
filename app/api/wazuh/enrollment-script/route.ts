import { NextRequest, NextResponse } from 'next/server';
import { getMysqlPool } from '@/lib/mysql';

const WAZUH_MANAGER_HOST = process.env.WAZUH_MANAGER_HOST || '10.20.100.131';
const WAZUH_AGENT_VERSION = process.env.WAZUH_AGENT_VERSION || '4.14.6-1';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tenantCode = searchParams.get('tenantCode') || 'TNT1';
    const os = searchParams.get('os') || 'linux-deb'; // linux-deb | linux-rpm | windows

    // Fetch tenant details from MySQL
    const pool = getMysqlPool();
    const [rows]: any = await pool.query(
      'SELECT tenant_code, campus_name, database_name FROM tenants WHERE tenant_code = ? LIMIT 1',
      [tenantCode.toUpperCase()]
    );

    const tenant = rows && rows.length > 0 ? rows[0] : {
      tenant_code: tenantCode.toUpperCase(),
      campus_name: 'tenant1',
      database_name: 'tenant1',
    };

    const targetGroup = tenant.database_name;
    let command = '';
    let instructions = '';

    if (os === 'linux-deb') {
      command = `wget https://packages.wazuh.com/4.x/wazuh-agent_${WAZUH_AGENT_VERSION}_amd64.deb && sudo WAZUH_MANAGER='${WAZUH_MANAGER_HOST}' WAZUH_AGENT_GROUP='${targetGroup}' dpkg -i ./wazuh-agent_${WAZUH_AGENT_VERSION}_amd64.deb && sudo systemctl daemon-reload && sudo systemctl enable wazuh-agent && sudo systemctl start wazuh-agent`;
      instructions = 'Run command in terminal on Ubuntu/Debian server with sudo / root privileges.';
    } else if (os === 'linux-rpm') {
      command = `sudo WAZUH_MANAGER='${WAZUH_MANAGER_HOST}' WAZUH_AGENT_GROUP='${targetGroup}' yum install -y https://packages.wazuh.com/4.x/yum/wazuh-agent-${WAZUH_AGENT_VERSION}.x86_64.rpm && sudo systemctl daemon-reload && sudo systemctl enable wazuh-agent && sudo systemctl start wazuh-agent`;
      instructions = 'Run command in terminal on CentOS/RHEL/AlmaLinux server with sudo / root privileges.';
    } else {
      command = `Invoke-WebRequest -Uri https://packages.wazuh.com/4.x/windows/wazuh-agent-4.14.6-1.msi -OutFile \${env:tmp}\\wazuh-agent.msi; msiexec.exe /i \${env:tmp}\\wazuh-agent.msi /q WAZUH_MANAGER='${WAZUH_MANAGER_HOST}' WAZUH_AGENT_GROUP='${targetGroup}'; NET START Wazuh`;
      instructions = 'Buka PowerShell sebagai Administrator (Run as Administrator) lalu paste perintah di atas.';
    }

    return NextResponse.json({
      success: true,
      tenantCode: tenant.tenant_code,
      campusName: tenant.campus_name,
      targetGroup,
      os,
      wazuhManager: WAZUH_MANAGER_HOST,
      command,
      instructions,
    });
  } catch (err: any) {
    console.error('API /api/wazuh/enrollment-script GET Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Failed to generate agent enrollment script' },
      { status: 500 }
    );
  }
}
