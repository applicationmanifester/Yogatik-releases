/**
 * NASA F Prime (F´) Flight Software & Embedded Systems Tool
 * 
 * Inspired by NASA JPL F Prime (github.com/nasa/fprime).
 * Scaffolds FPP (F Prime Prime) models, C++ flight components, command/telemetry dictionaries,
 * state machines, and validates flight topologies with MISRA/JPL avionics patterns.
 */

/**
 * Generate FPP (F Prime Prime) component specification
 */
export function generateFppComponent({
  name = 'SensorManager',
  namespace = 'Flight',
  kind = 'active', // 'active' | 'queued' | 'passive'
  ports = [],
  telemetry = [],
  commands = [],
  events = [],
  parameters = [],
}) {
  const compName = name.replace(/[^\w]/g, '') || 'SensorManager'
  const compKind = ['active', 'queued', 'passive'].includes(kind.toLowerCase()) ? kind.toLowerCase() : 'active'

  let fpp = `module ${namespace} {\n\n`
  fpp += `  @ Flight component ${compName} generated for NASA F Prime\n`
  fpp += `  ${compKind} component ${compName} {\n\n`

  // General Ports
  fpp += `    # ----------------------------------------------------------------------\n`
  fpp += `    # General Ports\n`
  fpp += `    # ----------------------------------------------------------------------\n`
  if (ports.length === 0) {
    fpp += `    @ Synchronous data request port\n`
    fpp += `    sync input port dataIn: Svc.DataPort\n\n`
    fpp += `    @ Asynchronous data output port\n`
    fpp += `    output port dataOut: Svc.DataPort\n\n`
  } else {
    for (const p of ports) {
      const dir = p.direction === 'output' ? 'output port' : `${p.kind || 'async'} input port`
      fpp += `    @ ${p.description || 'Port ' + p.name}\n`
      fpp += `    ${dir} ${p.name}: ${p.type || 'Fw.Buffer'}\n\n`
    }
  }

  // Commands
  if (commands.length > 0) {
    fpp += `    # ----------------------------------------------------------------------\n`
    fpp += `    # Commands\n`
    fpp += `    # ----------------------------------------------------------------------\n`
    for (const cmd of commands) {
      fpp += `    @ ${cmd.description || 'Command ' + cmd.name}\n`
      fpp += `    ${cmd.kind || 'async'} command ${cmd.name}(\n`
      if (cmd.args && cmd.args.length > 0) {
        const argsStr = cmd.args.map(a => `      ${a.name}: ${a.type}`).join(',\n')
        fpp += `${argsStr}\n`
      }
      fpp += `    ) opcode ${cmd.opcode || '0x100'}\n\n`
    }
  }

  // Telemetry Channels
  if (telemetry.length > 0) {
    fpp += `    # ----------------------------------------------------------------------\n`
    fpp += `    # Telemetry Channels\n`
    fpp += `    # ----------------------------------------------------------------------\n`
    for (const tlm of telemetry) {
      fpp += `    @ ${tlm.description || 'Telemetry channel ' + tlm.name}\n`
      fpp += `    telemetry ${tlm.name}: ${tlm.type || 'F32'} id ${tlm.id || '0x200'}`
      if (tlm.update) fpp += ` update ${tlm.update}`
      fpp += `\n\n`
    }
  }

  // Events / Flight Logs
  if (events.length > 0) {
    fpp += `    # ----------------------------------------------------------------------\n`
    fpp += `    # Events (Flight Logs)\n`
    fpp += `    # ----------------------------------------------------------------------\n`
    for (const evt of events) {
      const severity = evt.severity || 'ACTIVITY_HI'
      fpp += `    @ ${evt.description || 'Event ' + evt.name}\n`
      fpp += `    event ${evt.name}(\n`
      if (evt.args && evt.args.length > 0) {
        const argsStr = evt.args.map(a => `      ${a.name}: ${a.type}`).join(',\n')
        fpp += `${argsStr}\n`
      }
      fpp += `    ) severity ${severity} id ${evt.id || '0x300'} format "${evt.format || '{}'}"\n\n`
    }
  }

  // Parameters
  if (parameters.length > 0) {
    fpp += `    # ----------------------------------------------------------------------\n`
    fpp += `    # Parameters\n`
    fpp += `    # ----------------------------------------------------------------------\n`
    for (const param of parameters) {
      fpp += `    @ ${param.description || 'Parameter ' + param.name}\n`
      fpp += `    param ${param.name}: ${param.type || 'U32'} default ${param.default || '0'} id ${param.id || '0x400'}\n\n`
    }
  }

  // Standard Special Ports
  fpp += `    # ----------------------------------------------------------------------\n`
  fpp += `    # Special F Prime Ports\n`
  fpp += `    # ----------------------------------------------------------------------\n`
  fpp += `    @ Command receive port\n    command recv port cmdIn\n\n`
  fpp += `    @ Command registration port\n    command reg port cmdRegOut\n\n`
  fpp += `    @ Command response port\n    command resp port cmdResponseOut\n\n`
  fpp += `    @ Telemetry port\n    telemetry port tlmOut\n\n`
  fpp += `    @ Event port\n    event port eventOut\n\n`
  fpp += `    @ Time get port\n    time get port timeCaller\n\n`

  fpp += `  }\n\n`
  fpp += `}\n`

  return fpp
}

/**
 * Generate C++ Header (.hpp) for F Prime Component
 */
export function generateCppHeader({ name = 'SensorManager', namespace = 'Flight', commands = [] }) {
  const compName = name.replace(/[^\w]/g, '') || 'SensorManager'
  const guard = `${namespace.toUpperCase()}_${compName.toUpperCase()}_HPP`

  return `// ======================================================================
// \\title  ${compName}.hpp
// \\author NASA F Prime Generator / Yogatik
// \\brief  hpp file for ${compName} component implementation class
// ======================================================================

#ifndef ${guard}
#define ${guard}

#include "${namespace}/${compName}ComponentAc.hpp"

namespace ${namespace} {

  class ${compName} :
    public ${compName}ComponentBase
  {

    public:

      // ----------------------------------------------------------------------
      // Construction, initialization, and destruction
      // ----------------------------------------------------------------------

      //! Construct object ${compName}
      ${compName}(
          const char *const compName //!< The component name
      );

      //! Initialize object ${compName}
      void init(
          const NATIVE_INT_TYPE queueDepth, //!< The queue depth
          const NATIVE_INT_TYPE instance = 0 //!< The instance number
      );

      //! Destroy object ${compName}
      ~${compName}();

    PRIVATE:

      // ----------------------------------------------------------------------
      // Handler implementations for user-defined typed input ports
      // ----------------------------------------------------------------------

      //! Handler implementation for dataIn
      void dataIn_handler(
          const NATIVE_INT_TYPE portNum, //!< The port number
          Fw::Buffer &fwBuffer //!< The buffer
      );

      // ----------------------------------------------------------------------
      // Command handler implementations
      // ----------------------------------------------------------------------
${commands.map(cmd => `
      //! Handler implementation for command ${cmd.name}
      void ${cmd.name}_cmdHandler(
          const FwOpcodeType opCode, //!< The opcode
          const U32 cmdSeq //!< The command sequence number
      );`).join('\n')}

  };

} // end namespace ${namespace}

#endif // ${guard}
`
}

/**
 * Generate C++ Implementation (.cpp) for F Prime Component
 */
export function generateCppImpl({ name = 'SensorManager', namespace = 'Flight', commands = [] }) {
  const compName = name.replace(/[^\w]/g, '') || 'SensorManager'

  return `// ======================================================================
// \\title  ${compName}.cpp
// \\author NASA F Prime Generator / Yogatik
// \\brief  cpp file for ${compName} component implementation class
// ======================================================================

#include "${namespace}/${compName}.hpp"
#include "FpConfig.hpp"

namespace ${namespace} {

  // ----------------------------------------------------------------------
  // Construction, initialization, and destruction
  // ----------------------------------------------------------------------

  ${compName} ::
    ${compName}(
        const char *const compName
    ) :
      ${compName}ComponentBase(compName)
  {

  }

  void ${compName} ::
    init(
        const NATIVE_INT_TYPE queueDepth,
        const NATIVE_INT_TYPE instance
    )
  {
    ${compName}ComponentBase::init(queueDepth, instance);
  }

  ${compName} ::
    ~${compName}()
  {

  }

  // ----------------------------------------------------------------------
  // Handler implementations for user-defined typed input ports
  // ----------------------------------------------------------------------

  void ${compName} ::
    dataIn_handler(
        const NATIVE_INT_TYPE portNum,
        Fw::Buffer &fwBuffer
    )
  {
    // Implementation of data input handling
    FW_ASSERT(fwBuffer.getData() != nullptr);
  }

  // ----------------------------------------------------------------------
  // Command handler implementations
  // ----------------------------------------------------------------------
${commands.map(cmd => `
  void ${compName} ::
    ${cmd.name}_cmdHandler(
        const FwOpcodeType opCode,
        const U32 cmdSeq
    )
  {
    // Execute command logic
    this->cmdResponse_out(opCode, cmdSeq, Fw::CmdResponse::OK);
  }`).join('\n')}

} // end namespace ${namespace}
`
}

/**
 * Validates topology connections across components
 */
export function validateTopology(topology = {}) {
  const { components = [], connections = [] } = topology
  const errors = []
  const warnings = []

  const compMap = new Map()
  for (const c of components) {
    if (!c.name) {
      errors.push('Component found with missing name')
    } else {
      compMap.set(c.name, c)
    }
  }

  for (let i = 0; i < connections.length; i++) {
    const conn = connections[i]
    if (!conn.from || !conn.to) {
      errors.push(`Connection #${i + 1} is missing "from" or "to" endpoint.`)
      continue
    }

    const [srcComp, srcPort] = conn.from.split('.')
    const [dstComp, dstPort] = conn.to.split('.')

    if (!compMap.has(srcComp)) {
      errors.push(`Connection #${i + 1}: Source component "${srcComp}" is not declared in topology.`)
    }
    if (!compMap.has(dstComp)) {
      errors.push(`Connection #${i + 1}: Destination component "${dstComp}" is not declared in topology.`)
    }

    if (conn.type && conn.expectedType && conn.type !== conn.expectedType) {
      errors.push(`Port type mismatch on connection "${conn.from}" (${conn.type}) -> "${conn.to}" (${conn.expectedType}).`)
    }
  }

  return {
    valid: errors.length === 0,
    totalComponents: components.length,
    totalConnections: connections.length,
    errors,
    warnings,
  }
}

/**
 * Generate Ground Data System (GDS) command and telemetry dictionary
 */
export function generateDictionary({ name = 'SensorManager', commands = [], telemetry = [], events = [] }) {
  return {
    component: name,
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    framework: 'NASA F Prime (F´)',
    commands: commands.map((c, i) => ({
      opcode: c.opcode || `0x${(0x100 + i).toString(16).toUpperCase()}`,
      name: c.name,
      description: c.description || '',
      args: c.args || [],
    })),
    telemetry: telemetry.map((t, i) => ({
      id: t.id || `0x${(0x200 + i).toString(16).toUpperCase()}`,
      name: t.name,
      type: t.type || 'F32',
      description: t.description || '',
    })),
    events: events.map((e, i) => ({
      id: e.id || `0x${(0x300 + i).toString(16).toUpperCase()}`,
      name: e.name,
      severity: e.severity || 'ACTIVITY_HI',
      format: e.format || '{}',
      description: e.description || '',
    })),
  }
}

export const fprimeTool = {
  schema: {
    name: 'fprime',
    description: 'NASA F Prime (F´) flight software generator and topology validator. Scaffolds FPP component models, C++ flight headers/implementations, GDS command/telemetry dictionaries, and state machine models.',
    parameters: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['scaffold_component', 'validate_topology', 'generate_dictionary', 'state_machine'],
          description: 'Operation to perform: scaffold an FPP & C++ component, validate topology connections, export a command/telemetry dictionary, or scaffold a state machine.',
        },
        name: {
          type: 'string',
          description: 'Component or topology name (e.g. "ThrusterController", "CameraDriver", "PowerManager").',
        },
        namespace: {
          type: 'string',
          description: 'C++ module / namespace (e.g. "Flight", "Avionics", "Payload"). Default is "Flight".',
        },
        kind: {
          type: 'string',
          enum: ['active', 'queued', 'passive'],
          description: 'F Prime execution kind. "active" (dedicated thread + queue), "queued" (queue only), or "passive" (synchronous caller thread).',
        },
        ports: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string' },
              direction: { type: 'string', enum: ['input', 'output'] },
              kind: { type: 'string', enum: ['sync', 'async', 'guarded'] },
              description: { type: 'string' },
            },
            required: ['name', 'direction'],
          },
          description: 'List of typed input/output ports for the component.',
        },
        commands: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              opcode: { type: 'string' },
              kind: { type: 'string', enum: ['sync', 'async', 'guarded'] },
              description: { type: 'string' },
              args: { type: 'array', items: { type: 'object' } },
            },
            required: ['name'],
          },
          description: 'List of flight commands handled by this component.',
        },
        telemetry: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              id: { type: 'string' },
              type: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['name'],
          },
          description: 'List of telemetry downlink channels.',
        },
        events: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              id: { type: 'string' },
              severity: { type: 'string', enum: ['DIAGNOSTIC', 'ACTIVITY_LO', 'ACTIVITY_HI', 'WARNING_LO', 'WARNING_HI', 'FATAL'] },
              format: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['name'],
          },
          description: 'List of flight log event messages.',
        },
        parameters: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string' },
              default: { type: 'string' },
              id: { type: 'string' },
              description: { type: 'string' },
            },
            required: ['name'],
          },
          description: 'List of non-volatile configuration parameters.',
        },
        topology: {
          type: 'object',
          description: 'Topology definition containing { components: [...], connections: [...] } for validation.',
        },
      },
      required: ['action'],
    },
  },

  async execute(args) {
    const {
      action,
      name = 'SensorManager',
      namespace = 'Flight',
      kind = 'active',
      ports = [],
      commands = [],
      telemetry = [],
      events = [],
      parameters = [],
      topology = {},
    } = args

    switch (action) {
      case 'scaffold_component': {
        const fppCode = generateFppComponent({
          name, namespace, kind, ports, telemetry, commands, events, parameters,
        })
        const cppHeader = generateCppHeader({ name, namespace, commands })
        const cppImpl = generateCppImpl({ name, namespace, commands })

        return {
          success: true,
          action: 'scaffold_component',
          name,
          namespace,
          kind,
          files: {
            [`${name}.fpp`]: fppCode,
            [`${name}.hpp`]: cppHeader,
            [`${name}.cpp`]: cppImpl,
          },
        }
      }

      case 'validate_topology': {
        const result = validateTopology(topology)
        return {
          success: true,
          action: 'validate_topology',
          ...result,
        }
      }

      case 'generate_dictionary': {
        const dict = generateDictionary({ name, commands, telemetry, events })
        return {
          success: true,
          action: 'generate_dictionary',
          dictionary: dict,
        }
      }

      case 'state_machine': {
        const smCode = `module ${namespace} {\n\n  @ State machine for ${name}\n  state machine ${name}StateMachine {\n\n    initial state IDLE\n\n    state IDLE {\n      on START enter ARMING\n    }\n\n    state ARMING {\n      on READY enter ACTIVE\n      on FAULT enter SAFE_MODE\n    }\n\n    state ACTIVE {\n      on SHUTDOWN enter IDLE\n      on FAULT enter SAFE_MODE\n    }\n\n    state SAFE_MODE {\n      on RESET enter IDLE\n    }\n\n  }\n\n}\n`
        return {
          success: true,
          action: 'state_machine',
          name,
          stateMachineFpp: smCode,
        }
      }

      default:
        return {
          success: false,
          error: `Unknown action "${action}". Valid actions: scaffold_component, validate_topology, generate_dictionary, state_machine.`,
        }
    }
  },
}
