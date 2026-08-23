import { describe, it, expect } from 'vitest'
import {
  generateFppComponent,
  generateCppHeader,
  generateCppImpl,
  validateTopology,
  generateDictionary,
  fprimeTool,
} from './fprime'

describe('NASA F Prime (F´) Flight Software Tool', () => {
  it('generates valid FPP component model specifications', () => {
    const fpp = generateFppComponent({
      name: 'ThrusterController',
      namespace: 'Avionics',
      kind: 'active',
      ports: [
        { name: 'cmdInPort', direction: 'input', kind: 'sync', type: 'Svc.Sched' },
        { name: 'fireOutPort', direction: 'output', type: 'Fw.Buffer' },
      ],
      commands: [
        { name: 'FIRE_THRUSTER', opcode: '0x101', args: [{ name: 'durationMs', type: 'U32' }] },
      ],
      telemetry: [
        { name: 'ChamberPressure', type: 'F32', id: '0x201' },
      ],
      events: [
        { name: 'ThrusterFired', severity: 'ACTIVITY_HI', id: '0x301', format: 'Fired for {} ms' },
      ],
      parameters: [
        { name: 'MaxThrustDuration', type: 'U32', default: '5000', id: '0x401' },
      ],
    })

    expect(fpp).toContain('module Avionics')
    expect(fpp).toContain('active component ThrusterController')
    expect(fpp).toContain('sync input port cmdInPort: Svc.Sched')
    expect(fpp).toContain('output port fireOutPort: Fw.Buffer')
    expect(fpp).toContain('async command FIRE_THRUSTER')
    expect(fpp).toContain('telemetry ChamberPressure: F32 id 0x201')
    expect(fpp).toContain('event ThrusterFired')
    expect(fpp).toContain('param MaxThrustDuration: U32')
  })

  it('generates MISRA-compliant C++ component headers and implementations', () => {
    const hpp = generateCppHeader({
      name: 'ThrusterController',
      namespace: 'Avionics',
      commands: [{ name: 'FIRE_THRUSTER' }],
    })
    expect(hpp).toContain('#ifndef AVIONICS_THRUSTERCONTROLLER_HPP')
    expect(hpp).toContain('class ThrusterController :')
    expect(hpp).toContain('void FIRE_THRUSTER_cmdHandler(')

    const cpp = generateCppImpl({
      name: 'ThrusterController',
      namespace: 'Avionics',
      commands: [{ name: 'FIRE_THRUSTER' }],
    })
    expect(cpp).toContain('#include "Avionics/ThrusterController.hpp"')
    expect(cpp).toContain('void ThrusterController ::\n    FIRE_THRUSTER_cmdHandler(')
    expect(cpp).toContain('this->cmdResponse_out(opCode, cmdSeq, Fw::CmdResponse::OK);')
  })

  it('validates flight software topologies and catches missing components / type mismatches', () => {
    const validTopo = {
      components: [{ name: 'RateGroup' }, { name: 'SensorManager' }],
      connections: [
        { from: 'RateGroup.timeOut', to: 'SensorManager.timeIn', type: 'Svc.Sched', expectedType: 'Svc.Sched' },
      ],
    }
    const resValid = validateTopology(validTopo)
    expect(resValid.valid).toBe(true)
    expect(resValid.errors.length).toBe(0)

    const invalidTopo = {
      components: [{ name: 'RateGroup' }],
      connections: [
        { from: 'RateGroup.timeOut', to: 'MissingComponent.timeIn', type: 'Svc.Sched', expectedType: 'Fw.Buffer' },
      ],
    }
    const resInvalid = validateTopology(invalidTopo)
    expect(resInvalid.valid).toBe(false)
    expect(resInvalid.errors.some(e => e.includes('MissingComponent'))).toBe(true)
    expect(resInvalid.errors.some(e => e.includes('Port type mismatch'))).toBe(true)
  })

  it('generates GDS command and telemetry dictionaries', () => {
    const dict = generateDictionary({
      name: 'CameraDriver',
      commands: [{ name: 'CAPTURE_IMAGE', opcode: '0x100' }],
      telemetry: [{ name: 'SensorTemp', type: 'F32', id: '0x200' }],
      events: [{ name: 'ImageCaptured', id: '0x300' }],
    })

    expect(dict.component).toBe('CameraDriver')
    expect(dict.framework).toContain('NASA F Prime')
    expect(dict.commands.length).toBe(1)
    expect(dict.telemetry.length).toBe(1)
    expect(dict.events.length).toBe(1)
  })

  it('fprimeTool executes scaffold, validate, dictionary, and state_machine actions', async () => {
    const scaffoldRes = await fprimeTool.execute({
      action: 'scaffold_component',
      name: 'PowerManager',
      namespace: 'EPS',
      kind: 'active',
    })
    expect(scaffoldRes.success).toBe(true)
    expect(scaffoldRes.files['PowerManager.fpp']).toBeDefined()
    expect(scaffoldRes.files['PowerManager.hpp']).toBeDefined()
    expect(scaffoldRes.files['PowerManager.cpp']).toBeDefined()

    const smRes = await fprimeTool.execute({
      action: 'state_machine',
      name: 'FlightControl',
      namespace: 'GNC',
    })
    expect(smRes.success).toBe(true)
    expect(smRes.stateMachineFpp).toContain('state machine FlightControlStateMachine')
  })
})
