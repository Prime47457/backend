import { Guest } from '../models/guest'
import OtpModel, { Otp } from '../models/otp'
import ReservationModel, { Reservation } from '../models/reservation'
import ReservedBedModel from '../models/reserved_bed'
import RoomModel, { Room } from '../models/room'
import { Transaction } from '../models/transaction'

export interface ReservationWithRoom extends Reservation {
    rooms: Room[]
    transaction: Transaction
}
export interface IReservationRepository {
    findAvailableRooms(check_in: string, check_out: string): Promise<Room[]>
    findAvailableBeds(
        check_in: string,
        check_out: string,
        room_id: number
    ): Promise<Room>
    makeReservation(
        check_in: string,
        check_out: string,
        guest_id: string,
        beds: { id: number }[],
        special_requests: string
    ): Promise<Reservation>
    findRoomsInReservation(reservation_id: string): Promise<Room[]>
    getReservation(reservation_id: string): Promise<ReservationWithRoom>
    getReservationTransaction(reservation_id: string): Promise<Reservation>
    listReservations(guest_id: string): Promise<ReservationWithRoom[]>
    getGuestReservation(
        guest_id: string,
        check_in: Date
    ): Promise<ReservationWithRoom>
    createOtp(
        reservation_id: string,
        password: string,
        reference_code: string
    ): Promise<Otp>
    getReservationOwner(reservation_id: string): Promise<Guest>
}

export class ReservationRepository implements IReservationRepository {
    async findAvailableRooms(check_in: string, check_out: string) {
        const result = await RoomModel.query()
            .withGraphJoined('beds', { joinOperation: 'innerJoin' })
            .modifyGraph('beds', bed => {
                bed.fullOuterJoinRelated('reservations')
                    .whereNull('reservations.id')
                    .orWhere('reservations.check_out', '<=', check_in)
                    .orWhere('reservations.check_in', '>', check_out)
                    .select('bed.id')
            })
            .withGraphJoined('photos')
            .modifyGraph('photos', photo => {
                photo.select('photo_url', 'photo_description')
            })
            .withGraphJoined('facilities')
            .orderBy('room.id')
        return result
    }
    async findAvailableBeds(
        check_in: string,
        check_out: string,
        room_id: number
    ) {
        const result = RoomModel.query()
            .findById(room_id)
            .withGraphJoined('beds')
            .modifyGraph('beds', bed => {
                bed.fullOuterJoinRelated('reservations')
                    .whereNull('reservations.id')
                    .orWhere('reservations.check_out', '<=', check_in)
                    .orWhere('reservations.check_in', '>', check_out)
                    .select('bed.id')
                    .orderBy('id', 'ASC')
            })
        return result
    }
    async makeReservation(
        check_in: string,
        check_out: string,
        guest_id: string,
        beds: { id: number }[],
        special_requests: string
    ) {
        const reservation = await ReservationModel.query().insert({
            check_in: new Date(check_in),
            check_out: new Date(check_out),
            guest_id,
            special_requests
        })
        const reservedBeds = beds.map(({ id: bed_id }) => ({
            bed_id,
            reservation_id: reservation.id
        }))
        await ReservedBedModel.query().insert(reservedBeds)
        return reservation
    }
    findRoomsInReservation(reservation_id: string) {
        return RoomModel.query()
            .withGraphJoined('beds', {
                joinOperation: 'rightJoin'
            })
            .modifyGraph('beds', bed => {
                bed.innerJoinRelated('reservations').where(
                    'reservations.id',
                    '=',
                    reservation_id
                )
            })
            .withGraphJoined('photos')
            .modifyGraph('photos', photo => {
                photo.select('photo_url', 'photo_description')
            })
            .withGraphJoined('facilities')
            .orderBy('room.id')
    }

    async getReservation(reservation_id: string) {
        const reservation = await ReservationModel.query()
            .findById(reservation_id)
            .withGraphJoined('transaction')

        const rooms = await this.findRoomsInReservation(reservation_id)
        return {
            ...reservation,
            rooms
        } as ReservationWithRoom
    }

    async getReservationTransaction(reservation_id: string) {
        const reservation = await ReservationModel.query()
            .findById(reservation_id)
            .withGraphJoined('transaction')
        return reservation
    }

    async listReservations(guest_id: string) {
        const reservations = await ReservationModel.query()
            .where({ guest_id })
            .withGraphJoined('transaction')

        return Promise.all(
            reservations.map(async r => {
                const rooms = await this.findRoomsInReservation(r.id)
                return {
                    ...r,
                    rooms
                } as ReservationWithRoom
            })
        )
    }
    async getGuestReservation(guest_id: string, check_in: Date) {
        const reservation = await ReservationModel.query().findOne({
            guest_id,
            check_in
        })
        return this.getReservation(reservation.id)
    }

    createOtp(
        reservation_id: string,
        password: string,
        reference_code: string
    ) {
        return OtpModel.query().insert({
            id: reservation_id,
            password,
            reference_code
        })
    }
    async getReservationOwner(reservation_id: string) {
        return (await ReservationModel.query()
            .innerJoinRelated('guest')
            .findById(reservation_id)
            .select('guest.*')) as any
    }
}
