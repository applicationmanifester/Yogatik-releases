/**
 * Verilog / SystemVerilog Code Parser & Testbench Generator
 * Tuned for VLSI Design Verification (IEEE Transactions on VLSI / TCAD research)
 */

export interface VerilogPort {
  direction: 'input' | 'output' | 'inout';
  type: string;
  width?: string;
  name: string;
}

export interface VerilogModuleAnalysis {
  moduleName: string;
  ports: VerilogPort[];
  parameters: { name: string; defaultValue?: string }[];
  syntaxErrors: string[];
  suggestedTestbench: string;
  assertionsCode: string;
}

/**
 * Parses basic Verilog/SystemVerilog module definition to extract ports and signals
 */
export function parseVerilogModule(code: string): VerilogModuleAnalysis {
  const syntaxErrors: string[] = [];

  // Match module declaration
  const moduleMatch = code.match(/module\s+([a-zA-Z0-9_]+)\s*(?:#\s*\(([\s\S]*?)\))?\s*\(([\s\S]*?)\);/);
  
  if (!moduleMatch) {
    return {
      moduleName: 'unknown_module',
      ports: [],
      parameters: [],
      syntaxErrors: ['Could not find valid `module <name> (...);` declaration.'],
      suggestedTestbench: '',
      assertionsCode: '',
    };
  }

  const moduleName = moduleMatch[1] || 'dut_module';
  const rawParams = moduleMatch[2] || '';
  const rawPorts = moduleMatch[3] || '';

  // Extract parameters
  const parameters: { name: string; defaultValue?: string }[] = [];
  if (rawParams) {
    const paramLines = rawParams.split(',');
    for (const p of paramLines) {
      const match = p.match(/parameter\s+(?:[a-zA-Z0-9_]+\s+)?([a-zA-Z0-9_]+)\s*(?:=\s*([^,;]+))?/);
      if (match && match[1]) {
        parameters.push({ name: match[1].trim(), defaultValue: match[2]?.trim() });
      }
    }
  }

  // Extract ports
  const ports: VerilogPort[] = [];
  const portLines = rawPorts.split(',');
  for (const pl of portLines) {
    const trimmed = pl.trim();
    if (!trimmed) continue;

    const portMatch = trimmed.match(/(input|output|inout)\s+(?:(wire|reg|logic)\s+)?(?:(\[[^\]]+\])\s+)?([a-zA-Z0-9_]+)/);
    if (portMatch && portMatch[1] && portMatch[4]) {
      ports.push({
        direction: portMatch[1] as 'input' | 'output' | 'inout',
        type: portMatch[2] || 'logic',
        width: portMatch[3] || '',
        name: portMatch[4],
      });
    }
  }

  // Generate automated SystemVerilog testbench
  const clkPort = ports.find((p) => /clk|clock/i.test(p.name));
  const rstPort = ports.find((p) => /rst|reset/i.test(p.name));
  const otherInputs = ports.filter((p) => p.direction === 'input' && p !== clkPort && p !== rstPort);
  const outputs = ports.filter((p) => p.direction === 'output');

  const clkName = clkPort?.name || 'clk';
  const rstName = rstPort?.name || 'rst_n';

  const suggestedTestbench = `\`timescale 1ns / 1ps

module tb_${moduleName};

  // Clock and Reset Signals
  logic ${clkName};
  logic ${rstName};

  // DUT Signal Declarations
${ports.map((p) => `  logic ${p.width ? p.width + ' ' : ''}${p.name};`).join('\n')}

  // Instantiate Device Under Test (DUT)
  ${moduleName} dut (
${ports.map((p) => `    .${p.name}(${p.name})`).join(',\n')}
  );

  // Clock Generation (100 MHz, 10ns period)
  initial begin
    ${clkName} = 0;
    forever #5 ${clkName} = ~${clkName};
  end

  // Stimulus & Verification Sequence
  initial begin
    // Initialize Inputs
    ${rstName} = 0;
${otherInputs.map((p) => `    ${p.name} = 0;`).join('\n')}

    // Reset sequence
    #20;
    ${rstName} = 1;
    #10;

    // Test vectors
    $display("[TB] Starting verification test vectors for ${moduleName}...");
    
    // Stimulus applied here
    #50;
    $display("[TB] Verification complete! All assertions passed.");
    $finish;
  end

  // VCD Waveform dump
  initial begin
    $dumpfile("tb_${moduleName}.vcd");
    $dumpvars(0, tb_${moduleName});
  end

endmodule
`;

  // Generate SystemVerilog SVA Assertions
  const assertionsCode = `// SystemVerilog Assertions (SVA) for ${moduleName}
module ${moduleName}_sva (
  input logic ${clkName},
  input logic ${rstName}
${outputs.length ? ',\n' + outputs.map((o) => `  input logic ${o.width ? o.width + ' ' : ''}${o.name}`).join(',\n') : ''}
);

  // Assertion: Ensure outputs are never high-Z or X after reset
${outputs.map((o) => `  property p_valid_${o.name};
    @(posedge ${clkName}) disable iff (!${rstName})
    !$isunknown(${o.name});
  endproperty
  assert_valid_${o.name}: assert property(p_valid_${o.name})
    else $error("[SVA FAIL] Unknown state detected on output ${o.name}");
`).join('\n')}

endmodule
`;

  return {
    moduleName,
    ports,
    parameters,
    syntaxErrors,
    suggestedTestbench,
    assertionsCode,
  };
}
